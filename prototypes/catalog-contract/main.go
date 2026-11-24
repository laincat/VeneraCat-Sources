package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"github.com/laincat/veneracat-core/comic/js"
	"github.com/laincat/veneracat-core/host"
	"github.com/laincat/veneracat-core/plugin"
	"github.com/laincat/veneracat-core/service"
	"github.com/laincat/veneracat-core/subscription"
)

type offline struct{}

func (offline) Do(context.Context, *host.Request) (*host.Response, error) {
	return nil, fmt.Errorf("unexpected network access")
}

type artifact struct {
	URL    string `json:"url"`
	SHA256 string `json:"sha256"`
	Bytes  int    `json:"bytes"`
}
type entry struct {
	ID       string `json:"id"`
	Kind     string `json:"kind"`
	Key      string `json:"key"`
	Status   string `json:"status"`
	Supports struct {
		Platforms    []string `json:"platforms"`
		Capabilities []string `json:"requiresCapabilities"`
	} `json:"supports"`
	Artifact *artifact `json:"artifact"`
}

func main() {
	root := os.Args[1]
	raw, err := os.ReadFile(filepath.Join(root, "source.json"))
	must(err)

	col, err := subscription.ParseCollection(raw, "https://sources.invalid/source.json")
	must(err)
	if col.Schema != subscription.CollectionSchema || col.ID != "veneracat.official" {
		panic("unexpected collection identity from Core ParseCollection")
	}

	var source struct {
		Schema  string  `json:"$schema"`
		ID      string  `json:"id"`
		Entries []entry `json:"entries"`
	}
	must(json.Unmarshal(raw, &source))
	if source.Schema != "veneracat-source/1-draft" || source.ID != "veneracat.official" {
		panic("unexpected collection identity")
	}
	seen := map[string]bool{}
	expectedVideo := map[string]string{}
	serviceEntries := map[string]entry{}
	artifacts := 0
	for _, e := range source.Entries {
		if seen[e.ID] || len(e.Supports.Platforms) == 0 || len(e.Supports.Capabilities) == 0 {
			panic("invalid shared entry")
		}
		seen[e.ID] = true
		if e.Status == "planned" && e.Artifact != nil {
			panic("plan became installable")
		}
		if e.Artifact != nil {
			u, err := url.Parse(e.Artifact.URL)
			must(err)
			if u.IsAbs() {
				panic("unexpected remote artifact")
			}
			data, err := os.ReadFile(filepath.Join(root, filepath.FromSlash(u.Path)))
			must(err)
			sum := sha256.Sum256(data)
			if hex.EncodeToString(sum[:]) != e.Artifact.SHA256 || len(data) != e.Artifact.Bytes {
				panic("artifact integrity mismatch")
			}
			artifacts++
			if e.Kind == "video-source" && e.Status == "experimental" {
				if e.Key == "" {
					panic("video source missing key")
				}
				expectedVideo[e.Key] = u.Path
			}
			if e.Kind == "service" {
				serviceEntries[e.ID] = e
			}
		}
	}
	if !seen["plex"] || !seen["reader-preferences"] || !seen["service.trakt"] || !seen["service.tmdb"] || !seen["service.bangumi"] || !seen["image.colorization.comfyui"] {
		panic("collection omitted a content kind")
	}
	for _, old := range []string{"Nekularity", "Nekophage", "VeneraCat Core"} {
		if _, err := os.Stat(filepath.Join(root, old)); !os.IsNotExist(err) {
			panic("per-client publication remains")
		}
	}
	fmt.Printf("PASS single shared source: %d entries, %d verified artifacts, platform/capability annotations, no per-client feeds\n", len(source.Entries), artifacts)

	verifyServicePackages(root, serviceEntries)

	base := "https://sources.invalid/compat/vcvideo.json"
	raw, err = os.ReadFile(filepath.Join(root, "compat", "vcvideo.json"))
	must(err)
	idx, err := subscription.Parse(raw, base)
	must(err)
	if len(idx.Plugins) != len(expectedVideo) || expectedVideo["plex"] == "" {
		panic("unexpected compatibility index")
	}
	rt, err := js.New(js.Options{}, js.Services{Transport: offline{}, Env: js.Environment{AppVersion: "1.6.3"}})
	must(err)
	defer rt.Close()
	registry := plugin.New(rt, offline{})
	seenVideo := map[string]bool{}
	for _, p := range idx.Plugins {
		relPath, ok := expectedVideo[p.Key]
		if !ok || seenVideo[p.Key] {
			panic("unexpected compatibility index")
		}
		seenVideo[p.Key] = true
		body, err := os.ReadFile(filepath.Join(root, filepath.FromSlash(relPath)))
		must(err)
		rec, err := registry.InstallFromVideoIndex(context.Background(), base, p, string(body))
		must(err)
		if rec.Key != p.Key {
			panic("wrong installed key")
		}
		_, err = registry.Video(p.Key)
		must(err)
	}
	fmt.Printf("PASS existing Core parses legacy video adapter and installs %d video plugins (including plex) with checksum\n", len(idx.Plugins))
}

func verifyServicePackages(root string, services map[string]entry) {
	expectedMethods := map[string][]string{
		"service.bangumi": {"account.me", "metadata.search", "metadata.detail", "collection.get", "collection.update", "episode.update"},
		"service.tmdb":    {"metadata.search", "metadata.detail", "artwork.list"},
		"service.trakt":   {"account.me", "metadata.search", "watchlist.list", "history.list", "scrobble.start", "scrobble.stop"},
	}
	dataDir, err := os.MkdirTemp("", "veneracat-service-contract-*")
	must(err)
	defer os.RemoveAll(dataDir)

	ctx := context.Background()
	for id, wantMethods := range expectedMethods {
		e, ok := services[id]
		if !ok || e.Artifact == nil {
			panic(fmt.Sprintf("service %s missing installable artifact", id))
		}
		archive, err := os.ReadFile(filepath.Join(root, filepath.FromSlash(e.Artifact.URL)))
		must(err)
		installed, err := service.InstallPackageExpecting(ctx, dataDir, id, "collection:veneracat.official/"+id, e.Artifact.SHA256, archive)
		must(err)
		if installed.ID != id {
			panic(fmt.Sprintf("service %s installed as %s", id, installed.ID))
		}
		manifest, source, err := service.ReadInstalledPackage(dataDir, id)
		must(err)

		// 1) Missing secrets return structured MISSING_SECRET without throwing or leaking.
		logs := []string{}
		kv := map[string]string{}
		emptyHost := service.Host{
			Fetch: func(context.Context, string) (string, error) {
				return "", fmt.Errorf("unexpected network call when secrets are missing")
			},
			StorageGet: func(_ context.Context, k string) (string, bool, error) { v, ok := kv[k]; return v, ok, nil },
			StorageSet: func(_ context.Context, k, v string) error { kv[k] = v; return nil },
			Secret:     func(context.Context, string) (string, error) { return "", nil },
			Log:        func(level, msg string) { logs = append(logs, level+":"+msg) },
		}
		rt := service.NewRuntime(emptyHost, service.PermissionNetwork, service.PermissionStorage, service.PermissionSecrets)
		must(rt.Load(ctx, manifest, source))
		methods, err := rt.Describe(ctx)
		must(err)
		gotSet := map[string]bool{}
		for _, m := range methods {
			gotSet[m.Name] = true
		}
		for _, want := range wantMethods {
			if !gotSet[want] {
				panic(fmt.Sprintf("service %s describe() missing method %s", id, want))
			}
		}

		checkMethod := "account.me"
		checkPayload := json.RawMessage(`{}`)
		if id == "service.tmdb" {
			checkMethod = "metadata.search"
			checkPayload = json.RawMessage(`{"query":"Frieren"}`)
		}
		out, err := rt.Call(ctx, checkMethod, checkPayload)
		must(err)
		var missingResp struct {
			OK    bool `json:"ok"`
			Error struct {
				Code           string   `json:"code"`
				MissingSecrets []string `json:"missingSecrets"`
			} `json:"error"`
		}
		must(json.Unmarshal(out, &missingResp))
		if missingResp.OK || missingResp.Error.Code != "MISSING_SECRET" || len(missingResp.Error.MissingSecrets) == 0 {
			panic(fmt.Sprintf("service %s missing-secret response unexpected: %s", id, out))
		}
		rt.Close()

		// 2) Mock host execution in real Core MoeJS runtime + secret redaction check.
		secretToken := "super-secret-token-" + id
		secretClient := "super-secret-client-" + id
		secretKey := "super-secret-apikey-" + id
		logs = logs[:0]
		kv = map[string]string{}
		mockHost := service.Host{
			Fetch: func(_ context.Context, rawURL string) (string, error) {
				switch {
				case strings.Contains(rawURL, "api.bgm.tv/v0/me"):
					return `{"id":101,"username":"lain","nickname":"Lain"}`, nil
				case strings.Contains(rawURL, "api.bgm.tv/v0/search/subjects"):
					return "", fmt.Errorf("v0 post rejected with token %s", secretToken)
				case strings.Contains(rawURL, "api.bgm.tv/search/subject/"):
					return `{"results":1,"list":[{"id":400602,"type":2,"name":"葬送のフリーレン","name_cn":"葬送的芙莉莲","rating":{"score":8.8,"rank":25}}]}`, nil
				case strings.Contains(rawURL, "api.themoviedb.org/3/search/multi"):
					return `{"page":1,"total_pages":1,"total_results":1,"results":[{"id":209867,"media_type":"tv","name":"葬送的芙莉莲","poster_path":"/frieren.jpg"}]}`, nil
				case strings.Contains(rawURL, "api.themoviedb.org/3/tv/209867/images"):
					return "", fmt.Errorf("upstream failed for https://api.themoviedb.org/3/tv/209867/images?api_key=%s", secretKey)
				case strings.Contains(rawURL, "api.trakt.tv/users/settings"):
					return `{"user":{"username":"lain","ids":{"slug":"lain"},"name":"Lain","vip":false}}`, nil
				case strings.Contains(rawURL, "api.trakt.tv/scrobble/start"):
					return `{"id":99,"action":"start","progress":12.5}`, nil
				default:
					return "", fmt.Errorf("unexpected mock url: %s", rawURL)
				}
			},
			StorageGet: func(_ context.Context, k string) (string, bool, error) { v, ok := kv[k]; return v, ok, nil },
			StorageSet: func(_ context.Context, k, v string) error { kv[k] = v; return nil },
			Secret: func(_ context.Context, k string) (string, error) {
				switch k {
				case "access_token":
					return secretToken, nil
				case "client_id":
					return secretClient, nil
				case "api_key":
					return secretKey, nil
				case "api_read_token":
					return "", nil
				default:
					return "", nil
				}
			},
			Log: func(level, msg string) { logs = append(logs, level+":"+msg) },
		}
		rt2 := service.NewRuntime(mockHost, service.PermissionNetwork, service.PermissionStorage, service.PermissionSecrets)
		must(rt2.Load(ctx, manifest, source))
		switch id {
		case "service.bangumi":
			out, err := rt2.Call(ctx, "account.me", json.RawMessage(`{}`))
			must(err)
			if !strings.Contains(string(out), `"username":"lain"`) || kv["last_username"] != "lain" {
				panic(fmt.Sprintf("bangumi account.me unexpected: %s kv=%v", out, kv))
			}
			out, err = rt2.Call(ctx, "metadata.search", json.RawMessage(`{"keyword":"芙莉莲","type":"anime"}`))
			must(err)
			if !strings.Contains(string(out), `"fallbackUsed":true`) || !strings.Contains(string(out), `400602`) {
				panic(fmt.Sprintf("bangumi legacy fallback unexpected: %s", out))
			}
		case "service.tmdb":
			out, err := rt2.Call(ctx, "metadata.search", json.RawMessage(`{"query":"芙莉莲"}`))
			must(err)
			if !strings.Contains(string(out), `"ok":true`) || !strings.Contains(string(out), `209867`) {
				panic(fmt.Sprintf("tmdb search unexpected: %s", out))
			}
			out, err = rt2.Call(ctx, "artwork.list", json.RawMessage(`{"id":209867,"mediaType":"tv"}`))
			must(err)
			if strings.Contains(string(out), secretKey) || !strings.Contains(string(out), "[REDACTED]") {
				panic(fmt.Sprintf("tmdb leaked secret in error: %s", out))
			}
		case "service.trakt":
			out, err := rt2.Call(ctx, "account.me", json.RawMessage(`{}`))
			must(err)
			if !strings.Contains(string(out), `"slug":"lain"`) || kv["last_user_slug"] != "lain" {
				panic(fmt.Sprintf("trakt account.me unexpected: %s kv=%v", out, kv))
			}
			out, err = rt2.Call(ctx, "scrobble.start", json.RawMessage(`{"movie":{"title":"Eva","ids":{"trakt":1}},"progress":12.5}`))
			must(err)
			if !strings.Contains(string(out), `"ok":true`) || kv["last_scrobble"] == "" {
				panic(fmt.Sprintf("trakt scrobble.start unexpected: %s kv=%v", out, kv))
			}
		}
		for _, line := range logs {
			if strings.Contains(line, secretToken) || strings.Contains(line, secretClient) || strings.Contains(line, secretKey) {
				panic(fmt.Sprintf("service %s leaked secret in log: %s", id, line))
			}
		}
		rt2.Close()
	}

	installedList, err := service.InstalledPackages(dataDir)
	must(err)
	if len(installedList) != 3 {
		panic(fmt.Sprintf("expected 3 installed services, got %d", len(installedList)))
	}
	fmt.Printf("PASS Core service.Store + service.Runtime installed and executed %d service packages (bangumi, tmdb, trakt)\n", len(installedList))
}

func must(err error) {
	if err != nil {
		panic(err)
	}
}
