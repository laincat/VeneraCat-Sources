package main

import (
	"encoding/json"
	"fmt"
	"github.com/MoeForge/moejs"
	"github.com/MoeForge/moejs/eventloop"
	"github.com/MoeForge/moejs/webapi"
)

func must(e error) {
	if e != nil {
		panic(e)
	}
}
func main() {
	rt := moejs.NewRuntime(moejs.Options{MemoryLimit: 64 << 20})
	loop, e := eventloop.New(rt, eventloop.Options{})
	must(e)
	defer loop.Terminate()
	api, e := webapi.Install(loop, webapi.Options{})
	must(e)
	defer api.Close()
	var result any
	must(rt.SetGlobal("record", rt.Function("record", 1, func(_ *moejs.Realm, _ moejs.Value, args []moejs.Value) (moejs.Value, error) {
		var err error
		result, err = rt.ToGo(args[0])
		return moejs.Undefined(), err
	})))
	script, e := moejs.CompileScript("webapi-probe.js", `(async()=>{
  const text="A&B + 中文";
  const p=new URLSearchParams({q:text});
  const u=new URL("/search","https://fixture.invalid/base");u.searchParams.set("q",text);
  const req=new Request(u,{headers:{"X-Fixture":"yes"}});
  const response=await new Response('{"ok":true}').json();
  const controller=new AbortController();controller.abort();
  let refused=false;try{await fetch("https://no-network.invalid/")}catch(error){refused=error.name==="TypeError"}
  record({query:p.get("q")===text,urlQuery:u.searchParams.get("q")===text,headers:req.headers.get("X-Fixture")==="yes",body:response.ok===true,aborted:controller.signal.aborted,networkDisabled:refused});
 })()`)
	must(e)
	must(loop.Run(func(rt *moejs.Runtime) error { _, err := rt.RunScript(script); return err }))
	m, ok := result.(map[string]any)
	if !ok || len(m) != 6 {
		panic(fmt.Sprint(result))
	}
	for k, v := range m {
		if v != true {
			panic(k + " failed")
		}
	}
	ts, e := moejs.CompileTS("typed.ts", `export function answer(value: number): number {return value+1}`)
	must(e)
	linked, e := moejs.Link(ts, nil)
	must(e)
	must(rt.Load(linked))
	fn, ok := rt.Export("answer")
	if !ok {
		panic("missing TS export")
	}
	arg, e := rt.FromGo(41)
	must(e)
	v, e := rt.CallFunction(fn, moejs.Undefined(), arg)
	must(e)
	actual, e := rt.ToGo(v)
	must(e)
	if fmt.Sprint(actual) != "42" {
		panic(fmt.Sprint(actual))
	}
	if _, e := moejs.CompileTS("enum.ts", `export enum Kind {One}`); e == nil {
		panic("unexpected enum support; reevaluate boundary")
	}
	m["typescriptTypeErasure"] = true
	m["typescriptEnumRejected"] = true
	bytes, e := json.Marshal(m)
	must(e)
	fmt.Println(string(bytes))
	fmt.Println("PASS pinned MoeJS webapi and CompileTS library contracts; no Core host modification or iOS claim")
}
