"use strict";(()=>{var e={};e.id=854,e.ids=[854],e.modules={399:e=>{e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},517:e=>{e.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},9817:(e,t,r)=>{r.r(t),r.d(t,{originalPathname:()=>S,patchFetch:()=>f,requestAsyncStorage:()=>h,routeModule:()=>m,serverHooks:()=>g,staticGenerationAsyncStorage:()=>y});var a={};r.r(a),r.d(a,{POST:()=>d});var s=r(9303),o=r(8716),n=r(670),i=r(7070);let p="http://localhost:1234/v1",l=["Joy of TEVA","Teva Retreat","Teva Wellness","Teva Aeris Garden","Seongbuk Achae","Secret Garden","Breeze & Sunrise","Leeha","Kelly Luxury","Kelly Ananda","Kelly Prana","Yeonnam Lotus","Yeonnam Fish","Yeonnam Bird"],c=new Set(["pest_control","plant_watering","iot"]);async function u(){let e=await fetch(`${p}/models`),t=await e.json();return t.data?.[0]?.id??"local-model"}async function d(e){let{currentTasks:t}=await e.json(),r=new Set(t.map(e=>e.property)),a=l.filter(e=>!r.has(e));if(0===a.length)return i.NextResponse.json({tasks:[],message:"All properties already have tasks."});let s=t.length?t.map(e=>`${e.property}: ${e.title} [${e.type}]`).join("\n"):"None",o=`You are a property operations assistant for COZE Hospitality, managing STR properties in Seoul.

ACTIVE TASKS:
${s}

PROPERTIES WITH NO TASKS (pick from these):
${a.join(", ")}

Suggest exactly 2 new maintenance tasks for 2 different uncovered properties.

Task types allowed:
- pest_control: drain sprays, trap checks, cockroach/ant treatment, storage inspection
- plant_watering: indoor plants, rooftop garden, lobby planters, terrace pots

Rules:
- Only use properties listed in "PROPERTIES WITH NO TASKS"
- Be specific about the location within the property (kitchen, rooftop, lobby, etc.)
- Keep titles under 60 characters

Respond with ONLY a raw JSON array — no markdown, no explanation:
[{"property":"...","title":"...","type":"pest_control"}]`;try{let e=await u(),t=await fetch(`${p}/chat/completions`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:e,messages:[{role:"user",content:o}],temperature:.6,max_tokens:2e3,stream:!1})});if(!t.ok){let e=await t.text();return i.NextResponse.json({error:`LM Studio error ${t.status}: ${e}`},{status:502})}let a=await t.json(),s=a.choices?.[0]?.message??{},n=s.content?.trim()||s.reasoning_content?.trim()||"",d=n.replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,"").trim().match(/\[[\s\S]*?\]/);if(!d)return i.NextResponse.json({error:"Model did not return a JSON array.",raw:n},{status:502});let m=JSON.parse(d[0]).filter(e=>"string"==typeof e.property&&"string"==typeof e.title&&l.includes(e.property)&&c.has(e.type)&&!r.has(e.property)).slice(0,3);return i.NextResponse.json({tasks:m,model:e})}catch(t){let e=t.message?.includes("ECONNREFUSED")||t.message?.includes("fetch failed");return i.NextResponse.json({error:e?"LM Studio is not running on :1234":t.message},{status:502})}}let m=new s.AppRouteRouteModule({definition:{kind:o.x.APP_ROUTE,page:"/api/ai/ops-tasks/route",pathname:"/api/ai/ops-tasks",filename:"route",bundlePath:"app/api/ai/ops-tasks/route"},resolvedPagePath:"C:\\COZE_CORP\\cozmo_bridge\\admin-ui\\app\\api\\ai\\ops-tasks\\route.ts",nextConfigOutput:"standalone",userland:a}),{requestAsyncStorage:h,staticGenerationAsyncStorage:y,serverHooks:g}=m,S="/api/ai/ops-tasks/route";function f(){return(0,n.patchFetch)({serverHooks:g,staticGenerationAsyncStorage:y})}}};var t=require("../../../../webpack-runtime.js");t.C(e);var r=e=>t(t.s=e),a=t.X(0,[948,972],()=>r(9817));module.exports=a})();