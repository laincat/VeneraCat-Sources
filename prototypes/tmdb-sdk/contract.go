package main

import (
	"context"
	"encoding/json"
	"fmt"
	mp "github.com/laincat/veneracat-core/magpieplugin"
	"net/url"
	"os"
	"strings"
)

type fixture struct{ seen int }

func (h *fixture) Do(ctx context.Context, r *mp.Request) (*mp.Response, error) {
	h.seen++
	u, e := url.Parse(r.URL)
	if e != nil {
		return nil, e
	}
	if r.Method != "GET" || u.Host != "api.themoviedb.org" || u.Path != "/3/search/tv" || u.Query().Get("query") != "A&B + 中文" || u.Query().Get("language") != "zh-CN" {
		return nil, fmt.Errorf("unexpected request shape")
	}
	token := ""
	for k, v := range r.Header {
		if strings.EqualFold(k, "Authorization") {
			token = strings.Join(v, ",")
		}
	}
	if token != "Bearer fixture-only" {
		return nil, fmt.Errorf("unexpected auth header")
	}
	return &mp.Response{Status: 200, URL: r.URL, Header: map[string][]string{"Content-Type": {"application/json"}}, Body: []byte(`{"page":1,"total_pages":1,"total_results":1,"results":[{"id":42,"name":"夹具剧集"}]}`)}, nil
}
func main() {
	b, e := os.ReadFile(os.Args[1])
	must(e)
	bundle, e := mp.NewBundle(map[string][]byte{"package.json": []byte(`{"name":"tmdb-sdk-probe","type":"module","main":"index.mjs"}`), "index.mjs": b})
	must(e)
	loader, e := mp.Load(bundle)
	must(e)
	in, e := loader.NewInstance(mp.Options{})
	must(e)
	defer in.Close()
	h := &fixture{}
	must(in.UseHost(h))
	result, e := in.Call("searchSeries", map[string]any{"accessToken": "fixture-only", "query": "A&B + 中文"})
	must(e)
	out, e := json.Marshal(result)
	must(e)
	if h.seen != 1 || !strings.Contains(string(out), "夹具剧集") {
		panic("unexpected result")
	}
	fmt.Println("PASS tmdb-ts 2.3.0 browser ESM loaded in actual Core; search query/auth headers/JSON result verified; no network or real account")
}
func must(e error) {
	if e != nil {
		panic(e)
	}
}
