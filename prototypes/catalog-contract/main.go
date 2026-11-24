package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"github.com/laincat/veneracat-core/comic/js"
	"github.com/laincat/veneracat-core/host"
	"github.com/laincat/veneracat-core/plugin"
	"github.com/laincat/veneracat-core/subscription"
	"net/url"
	"os"
	"path/filepath"
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
		}
	}
	if !seen["plex"] || !seen["reader-preferences"] || !seen["service.trakt"] || !seen["image.colorization.comfyui"] {
		panic("collection omitted a content kind")
	}
	for _, old := range []string{"Nekularity", "Nekophage", "VeneraCat Core"} {
		if _, err := os.Stat(filepath.Join(root, old)); !os.IsNotExist(err) {
			panic("per-client publication remains")
		}
	}
	fmt.Printf("PASS single shared source: %d entries, %d verified artifacts, platform/capability annotations, no per-client feeds\n", len(source.Entries), artifacts)
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
	fmt.Printf("PASS existing Core parses legacy video adapter and installs %d video plugins (including plex) with checksum; unified source consumer/module executor still pending\n", len(idx.Plugins))
}
func must(err error) {
	if err != nil {
		panic(err)
	}
}
