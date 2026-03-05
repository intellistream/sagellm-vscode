"use strict";var Te=Object.create;var Y=Object.defineProperty;var Le=Object.getOwnPropertyDescriptor;var Be=Object.getOwnPropertyNames;var $e=Object.getPrototypeOf,Ie=Object.prototype.hasOwnProperty;var _e=(n,e)=>{for(var t in e)Y(n,t,{get:e[t],enumerable:!0})},de=(n,e,t,s)=>{if(e&&typeof e=="object"||typeof e=="function")for(let o of Be(e))!Ie.call(n,o)&&o!==t&&Y(n,o,{get:()=>e[o],enumerable:!(s=Le(e,o))||s.enumerable});return n};var M=(n,e,t)=>(t=n!=null?Te($e(n)):{},de(e||!n||!n.__esModule?Y(t,"default",{value:n,enumerable:!0}):t,n)),Pe=n=>de(Y({},"__esModule",{value:!0}),n);var et={};_e(et,{activate:()=>Ke,deactivate:()=>Je});module.exports=Pe(et);var g=M(require("vscode")),re=M(require("child_process"));var v=M(require("vscode"));var ce=M(require("https")),le=M(require("http")),pe=M(require("vscode"));var Ae={STUDIO_FRONTEND:5173,STUDIO_BACKEND:8765,SAGELLM_GATEWAY:8889,EDGE_DEFAULT:8899,SAGELLM_SERVE_PORT:8901,SAGELLM_ENGINE_PORT:8902,SAGELLM_SERVE_PORT_2:8903,SAGELLM_ENGINE_PORT_2:8904,EMBEDDING_DEFAULT:8090,EMBEDDING_SECONDARY:8091,BENCHMARK_EMBEDDING:8950,BENCHMARK_API:8951},A=Ae.SAGELLM_SERVE_PORT;var x=class extends Error{constructor(t,s){super(t);this.statusCode=s;this.name="GatewayConnectionError"}};function F(){let n=pe.workspace.getConfiguration("sagellm"),e=n.get("gateway.host","localhost"),t=n.get("gateway.port",A),s=n.get("gateway.apiKey","");return{baseUrl:`${n.get("gateway.tls",!1)?"https":"http"}://${e}:${t}`,apiKey:s}}function H(n,e,t,s){return new Promise((o,a)=>{let r=new URL(e),i=r.protocol==="https:"?ce:le,f={hostname:r.hostname,port:r.port,path:r.pathname+r.search,method:n,headers:{"Content-Type":"application/json",Accept:"application/json",...t?{Authorization:`Bearer ${t}`}:{},...s?{"Content-Length":Buffer.byteLength(s)}:{}}},h=i.request(f,d=>{let u="";d.on("data",p=>u+=p),d.on("end",()=>o({statusCode:d.statusCode??0,data:u}))});h.on("error",d=>a(new x(`Network error: ${d.message}`))),h.setTimeout(3e4,()=>{h.destroy(),a(new x("Request timed out after 30s"))}),s&&h.write(s),h.end()})}async function K(){let{baseUrl:n,apiKey:e}=F();try{let{statusCode:t,data:s}=await H("GET",`${n}/v1/models`,e);if(t!==200)throw new x(`Gateway returned HTTP ${t}`,t);return JSON.parse(s).data??[]}catch(t){throw t instanceof x?t:new x(`Failed to reach sagellm-gateway at ${n}: ${String(t)}`)}}async function C(){let{baseUrl:n,apiKey:e}=F();try{let{statusCode:t}=await H("GET",`${n}/v1/models`,e);return t===200}catch{return!1}}async function ue(n,e,t){let{baseUrl:s,apiKey:o}=F(),a=JSON.stringify({...n,stream:!0});return new Promise((r,l)=>{if(t?.aborted){l(new Error("Aborted"));return}let i=new URL(`${s}/v1/chat/completions`),h=i.protocol==="https:"?ce:le,d={hostname:i.hostname,port:i.port,path:i.pathname,method:"POST",headers:{"Content-Type":"application/json",Accept:"text/event-stream",...o?{Authorization:`Bearer ${o}`}:{},"Content-Length":Buffer.byteLength(a)}},u="",p="",m=h.request(d,c=>{if(c.statusCode!==200){let b="";c.on("data",L=>b+=L),c.on("end",()=>l(new x(`Gateway returned HTTP ${c.statusCode}: ${b}`,c.statusCode)));return}c.on("data",b=>{p+=b.toString();let L=p.split(`
`);p=L.pop()??"";for(let P of L){let S=P.trim();if(!(!S||S==="data: [DONE]")&&S.startsWith("data: "))try{let y=JSON.parse(S.slice(6)).choices?.[0]?.delta?.content??"";y&&(u+=y,e(y))}catch{}}}),c.on("end",()=>r(u)),c.on("error",b=>l(new x(b.message)))});m.on("error",c=>l(new x(`Network error: ${c.message}`))),m.setTimeout(12e4,()=>{m.destroy(),l(new x("Chat request timed out after 120s"))}),t&&t.addEventListener("abort",()=>{m.destroy(),r(u)}),m.write(a),m.end()})}async function ge(n){let{baseUrl:e,apiKey:t}=F(),s=JSON.stringify({...n,stream:!1}),{statusCode:o,data:a}=await H("POST",`${e}/v1/completions`,t,s);if(o===404)throw new x("Endpoint /v1/completions not available",404);if(o!==200)throw new x(`Gateway returned HTTP ${o}: ${a}`,o);return JSON.parse(a).choices?.[0]?.text??""}async function me(n){let{baseUrl:e,apiKey:t}=F(),s=JSON.stringify({...n,stream:!1}),{statusCode:o,data:a}=await H("POST",`${e}/v1/chat/completions`,t,s);if(o!==200)throw new x(`Gateway returned HTTP ${o}: ${a}`,o);return JSON.parse(a).choices?.[0]?.message?.content??""}async function he(n){let{baseUrl:e,apiKey:t}=F(),s=JSON.stringify({...n,stream:!1}),{statusCode:o,data:a}=await H("POST",`${e}/v1/chat/completions`,t,s);if(o!==200)throw new x(`Gateway returned HTTP ${o}: ${a}`,o);let l=JSON.parse(a).choices?.[0];return{message:l?.message??{role:"assistant",content:""},finishReason:l?.finish_reason??"stop"}}var w=M(require("vscode")),J=M(require("child_process")),X=M(require("fs")),ae=M(require("path")),fe=M(require("os"));var R=[{id:"Qwen/Qwen2.5-0.5B-Instruct",size:"0.5B",vram:"~1 GB",tags:["chat","cpu-ok","fast"],desc:"Tiny Qwen chat, runs on CPU"},{id:"Qwen/Qwen2.5-Coder-0.5B-Instruct",size:"0.5B",vram:"~1 GB",tags:["code","cpu-ok","fast"],desc:"Tiny code assistant"},{id:"TinyLlama/TinyLlama-1.1B-Chat-v1.0",size:"1.1B",vram:"~2 GB",tags:["chat","cpu-ok"],desc:"Lightweight general chat"},{id:"Qwen/Qwen2.5-1.5B-Instruct",size:"1.5B",vram:"~3 GB",tags:["chat","fast"],desc:"Fast Qwen chat"},{id:"Qwen/Qwen2.5-Coder-1.5B-Instruct",size:"1.5B",vram:"~3 GB",tags:["code","fast"],desc:"Fast code assistant"},{id:"deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B",size:"1.5B",vram:"~3 GB",tags:["chat","reasoning"],desc:"DeepSeek-R1 distilled, strong reasoning"},{id:"Qwen/Qwen2.5-3B-Instruct",size:"3B",vram:"~6 GB",tags:["chat"],desc:"Balanced Qwen chat"},{id:"Qwen/Qwen2.5-Coder-3B-Instruct",size:"3B",vram:"~6 GB",tags:["code"],desc:"Balanced code assistant"},{id:"Qwen/Qwen2.5-7B-Instruct",size:"7B",vram:"~14 GB",tags:["chat","powerful"],desc:"Powerful Qwen chat (needs GPU)"},{id:"Qwen/Qwen2.5-Coder-7B-Instruct",size:"7B",vram:"~14 GB",tags:["code","powerful"],desc:"Powerful code assistant (needs GPU)"},{id:"deepseek-ai/DeepSeek-R1-Distill-Qwen-7B",size:"7B",vram:"~14 GB",tags:["chat","reasoning","powerful"],desc:"DeepSeek-R1 distilled 7B"}];function ve(){return ae.join(fe.homedir(),".cache","huggingface","hub")}function Re(n){return"models--"+n.replace(/\//g,"--")}function W(n){let e=ae.join(ve(),Re(n));return X.existsSync(e)}function De(){let n=new Set;try{for(let e of X.readdirSync(ve()))e.startsWith("models--")&&n.add(e.slice(8).replace(/--/g,"/"))}catch{}return n}async function Ge(n){return w.window.withProgress({location:w.ProgressLocation.Notification,title:`SageLLM: Downloading ${n}`,cancellable:!0},async(e,t)=>new Promise(s=>{let o=J.spawn("huggingface-cli",["download",n,"--resume-download"],{env:{...process.env}}),a=0,r=i=>{let f=i.match(/(\d+)%\|/);if(f){let h=parseInt(f[1],10),d=h-a;if(d>0){a=h;let u=i.match(/[\d.]+\s*[MG]B\/s/)?.[0]??"",p=i.match(/<([\d:]+),/)?.[1]??"";e.report({increment:d,message:`${h}%${u?"  "+u:""}${p?"  ETA "+p:""}`})}}else if(i.includes("Downloading")){let h=i.match(/Downloading (.+?):/)?.[1];h&&e.report({message:h})}},l="";o.stderr.on("data",i=>{let f=i.toString();l+=f;for(let h of f.split(/\r?\n/))r(h)}),o.stdout.on("data",i=>{for(let f of i.toString().split(/\r?\n/))r(f)}),o.on("close",i=>{i===0?(e.report({increment:100-a,message:"\u5B8C\u6210 \u2713"}),s(!0)):(t.isCancellationRequested||w.window.showErrorMessage(`SageLLM: \u4E0B\u8F7D\u5931\u8D25 (exit ${i}).
${l.slice(-300)}`),s(!1))}),o.on("error",i=>{w.window.showErrorMessage(`SageLLM: \u65E0\u6CD5\u8FD0\u884C huggingface-cli: ${i.message}`),s(!1)}),t.onCancellationRequested(()=>{o.kill("SIGTERM"),s(!1)})}))}function Ne(n){let e=[{id:"cpu",label:"$(circuit-board) CPU",detected:!0,description:"Always available"}],t=/CUDA.*✅|✅.*CUDA|✅.*\d+\s*device/i.test(n),s=/Ascend.*✅|✅.*Ascend|✅.*torch_npu/i.test(n),o=n.match(/CUDA[^\n]*✅[^\n]*?-\s*(.+)|✅\s*\d+\s*device[^-]*-\s*(.+)/i),a=o?(o[1]||o[2]||"").trim().split(`
`)[0]:"";return t&&e.push({id:"cuda",label:"$(zap) CUDA (GPU)",detected:!0,description:a||"NVIDIA GPU detected"}),s&&e.push({id:"ascend",label:"$(hubot) Ascend (\u6607\u817E NPU)",detected:!0,description:"Ascend NPU detected"}),e}async function ze(){return new Promise(n=>{J.exec("sagellm info",{timeout:15e3},(e,t)=>{try{n(Ne(t??""))}catch{n([{id:"cpu",label:"$(circuit-board) CPU",detected:!0,description:"Always available"}])}})})}async function Oe(){try{return(await K()).map(e=>e.id)}catch{return[]}}async function Fe(n,e){let t=w.QuickPickItemKind.Separator,[s,o]=await Promise.all([Oe(),Promise.resolve(De())]),a=new Set,r=[],l=c=>{let b=c.detail??c.label;a.has(b)||(a.add(b),r.push(c))};if(e){let c=o.has(e);l({label:`$(star-full) ${e}`,description:c?"\u2705 last used":"\u2601\uFE0F last used (not cached)",detail:e})}if(s.length){r.push({label:"Running on gateway",kind:t});for(let c of s)l({label:`$(server) ${c}`,description:"\u2705 serving now",detail:c})}let i=R.filter(c=>o.has(c.id)),f=[...o].filter(c=>!R.some(b=>b.id===c)),h=n.filter(c=>o.has(c)),d=[],u=(c,b)=>{a.has(c)||(a.add(c),d.push({label:`$(database) ${c}`,description:`\u2705 ${b}`,detail:c}))};i.forEach(c=>u(c.id,`${c.size} \xB7 ${c.vram} \xB7 ${c.desc}`)),h.forEach(c=>u(c,"recent")),f.forEach(c=>u(c,"local cache")),d.length&&(r.push({label:"Downloaded",kind:t}),r.push(...d));let p=[];for(let c of R){if(a.has(c.id))continue;a.add(c.id);let b=c.tags.includes("cpu-ok")?"runs on CPU \xB7 ":"";p.push({label:`$(cloud-download) ${c.id}`,description:`\u2601\uFE0F ${c.size} \xB7 ${c.vram}  \u2014  ${b}${c.desc}`,detail:c.id})}p.length&&(r.push({label:"Recommended  (will auto-download)",kind:t}),r.push(...p));let m=n.filter(c=>!a.has(c));if(m.length){r.push({label:"Recent",kind:t});for(let c of m)a.add(c),r.push({label:`$(history) ${c}`,description:"recent",detail:c})}return r.push({label:"",kind:t}),r.push({label:"$(edit) Enter model path / HuggingFace ID\u2026",description:"",detail:"__custom__"}),r}async function q(n,e){let t=w.workspace.getConfiguration("sagellm"),s=t.get("gateway.port",A);e?.setConnecting();let a=(await ze()).map(y=>({label:y.label,description:y.detected?`\u2705 ${y.description}`:y.description,detail:y.id})),r=t.get("backend","");if(r){let y=a.findIndex(z=>z.detail===r);y>0&&a.unshift(...a.splice(y,1))}else a.reverse();let l=await w.window.showQuickPick(a,{title:"SageLLM: Select Inference Backend",placeHolder:"Choose hardware backend to use"});if(!l){e?.setGatewayStatus(!1);return}let i=l.detail;await t.update("backend",i,w.ConfigurationTarget.Global);let f=n.globalState.get("sagellm.recentModels",[]),h=t.get("preloadModel","").trim(),d=await w.window.withProgress({location:w.ProgressLocation.Notification,title:"SageLLM: Scanning models\u2026",cancellable:!1},()=>Fe(f,h)),u=R.filter(y=>!W(y.id)).length,p=await w.window.showQuickPick(d,{title:`SageLLM: Select Model  (\u2601\uFE0F ${u} available to download)`,placeHolder:"\u2705 downloaded \xB7 \u2601\uFE0F will auto-download \xB7 $(edit) custom path",matchOnDescription:!0,matchOnDetail:!1});if(!p){e?.setGatewayStatus(!1);return}let m=p.detail;if(m==="__custom__"){if(m=await w.window.showInputBox({title:"SageLLM: Model Path or HuggingFace ID",prompt:"e.g.  Qwen/Qwen2.5-7B-Instruct  or  /models/my-model",value:h,ignoreFocusOut:!0})??"",!m.trim()){e?.setGatewayStatus(!1);return}m=m.trim()}if(!W(m)&&!m.startsWith("/")){if(await w.window.showInformationMessage(`"${m}" \u5C1A\u672A\u4E0B\u8F7D\u3002\u662F\u5426\u73B0\u5728\u4E0B\u8F7D\uFF1F`,{modal:!0},"\u4E0B\u8F7D","\u53D6\u6D88")!=="\u4E0B\u8F7D"){e?.setGatewayStatus(!1);return}if(!await Ge(m)){e?.setGatewayStatus(!1);return}w.window.showInformationMessage(`\u2705 ${m} \u4E0B\u8F7D\u5B8C\u6210`)}await t.update("preloadModel",m,w.ConfigurationTarget.Global),await n.globalState.update("sagellm.recentModels",[m,...f.filter(y=>y!==m)].slice(0,10));let b=`${t.get("gatewayStartCommand","sagellm serve")} --backend ${i} --model ${m} --port ${s}`,L=w.window.createTerminal({name:"SageLLM Server",isTransient:!1,env:{SAGELLM_PREFLIGHT_CANARY:"0"}});L.sendText(b),L.show(!1),w.window.showInformationMessage(`SageLLM: Starting ${i.toUpperCase()} \xB7 ${m}\u2026`);let P=0,S=100,N=setInterval(async()=>{if(P++,await C())clearInterval(N),e?.setGatewayStatus(!0),w.window.showInformationMessage(`SageLLM: Server ready \u2713  (${i} \xB7 ${m})`);else if(P>=S)clearInterval(N),e?.setError("Server start timed out"),w.window.showWarningMessage("SageLLM: Server did not respond within 5 minutes. Check the terminal.");else if(P%20===0){let y=Math.round(P*3/60);w.window.setStatusBarMessage(`SageLLM: Loading model\u2026 (${y} min elapsed)`,5e3)}},3e3)}var Q=v.QuickPickItemKind.Separator,Z=class{constructor(e){this.context=e;this.selectedModel=v.workspace.getConfiguration("sagellm").get("model","")||e.globalState.get("sagellm.selectedModel","")}models=[];selectedModel="";_onDidChangeModels=new v.EventEmitter;onDidChangeModels=this._onDidChangeModels.event;get currentModel(){return this.selectedModel}getModels(){return this.models}async refresh(){try{return this.models=await K(),this._onDidChangeModels.fire(this.models),this.models}catch(e){throw e instanceof x?e:new Error(String(e))}}async selectModelInteractive(){let e=[];try{e=await this.refresh()}catch{}let t=new Set(e.map(i=>i.id)),s=[];if(e.length>0){s.push({label:"Running in gateway",kind:Q});for(let i of e)s.push({label:`$(check) ${i.id}`,description:"\u25CF active",detail:i.id})}let o=R.filter(i=>W(i.id)&&!t.has(i.id));if(o.length>0){s.push({label:"Downloaded \u2014 restart gateway to load",kind:Q});for(let i of o)s.push({label:`$(package) ${i.id}`,description:`${i.size} \xB7 ${i.vram}`,detail:i.id})}let a=R.filter(i=>!W(i.id)&&!t.has(i.id));if(a.length>0){s.push({label:"Available to download",kind:Q});for(let i of a)s.push({label:`$(cloud-download) ${i.id}`,description:`${i.size} \xB7 ${i.vram} \xB7 ${i.desc}`,detail:i.id})}s.push({label:"",kind:Q}),s.push({label:"$(edit) Enter model path / HuggingFace ID\u2026",description:"",detail:"__custom__"});let r=await v.window.showQuickPick(s,{placeHolder:"$(check) active  $(package) local  $(cloud-download) downloadable",title:"SageLLM: Select Model",matchOnDescription:!0});if(!r||r.kind===Q)return;let l=r.detail??"";if(l==="__custom__"){if(l=await v.window.showInputBox({title:"SageLLM: Model Path or HuggingFace ID",prompt:"e.g.  Qwen/Qwen2.5-7B-Instruct  or  /models/my-model",value:this.selectedModel,ignoreFocusOut:!0})??"",!l.trim())return;l=l.trim()}return await this.setModel(l),t.has(l)||(await v.workspace.getConfiguration("sagellm").update("preloadModel",l,v.ConfigurationTarget.Global),await v.window.showInformationMessage(`"${l}" is not currently loaded. Restart gateway to use it?`,"Restart Gateway","Later")==="Restart Gateway"&&v.commands.executeCommand("sagellm.restartGateway")),l}async setModel(e){this.selectedModel=e,await this.context.globalState.update("sagellm.selectedModel",e),v.workspace.getConfiguration("sagellm").update("model",e,v.ConfigurationTarget.Global)}async ensureModel(){return this.selectedModel?this.selectedModel:this.selectModelInteractive()}dispose(){this._onDidChangeModels.dispose()}},ee=class{constructor(e){this.modelManager=e;e.onDidChangeModels(()=>this._onDidChangeTreeData.fire())}_onDidChangeTreeData=new v.EventEmitter;onDidChangeTreeData=this._onDidChangeTreeData.event;getTreeItem(e){return e}getChildren(){let e=this.modelManager.getModels();return e.length===0?[new te("No models loaded",v.TreeItemCollapsibleState.None,!0)]:e.map(t=>new te(t.id,v.TreeItemCollapsibleState.None,!1,t.id===this.modelManager.currentModel,t))}refresh(){this._onDidChangeTreeData.fire()}},te=class extends v.TreeItem{constructor(t,s,o=!1,a=!1,r){super(t,s);this.model=r;o?(this.contextValue="placeholder",this.iconPath=new v.ThemeIcon("info")):a?(this.iconPath=new v.ThemeIcon("check"),this.contextValue="activeModel",this.description="active"):(this.iconPath=new v.ThemeIcon("hubot"),this.contextValue="model",this.command={command:"sagellm.selectModel",title:"Select Model",arguments:[t]})}};var E=M(require("vscode"));var I=M(require("vscode")),$=M(require("path")),T=M(require("fs")),we=[{type:"function",function:{name:"get_active_file",description:"Get the content of the file currently open in the editor, along with the cursor position and any selected text.",parameters:{type:"object",properties:{}}}},{type:"function",function:{name:"read_file",description:"Read the contents of a file in the workspace. You can optionally specify a line range. The path can be absolute or relative to the workspace root.",parameters:{type:"object",properties:{path:{type:"string",description:"File path relative to workspace root or absolute"},start_line:{type:"number",description:"First line to read (1-based, inclusive). Optional."},end_line:{type:"number",description:"Last line to read (1-based, inclusive). Optional."}},required:["path"]}}},{type:"function",function:{name:"list_directory",description:"List the files and subdirectories in a directory. Returns names; trailing '/' indicates a directory.",parameters:{type:"object",properties:{path:{type:"string",description:"Directory path relative to workspace root (empty string or '.' for root)."}},required:[]}}},{type:"function",function:{name:"search_code",description:"Search for a text pattern (regex supported) across workspace files. Returns matching lines with file paths and line numbers. Like grep.",parameters:{type:"object",properties:{pattern:{type:"string",description:"Text or regex pattern to search for."},include_pattern:{type:"string",description:"Glob pattern to restrict which files are searched, e.g. '**/*.py'. Optional."},max_results:{type:"number",description:"Maximum number of results to return (default 30)."}},required:["pattern"]}}},{type:"function",function:{name:"get_workspace_info",description:"Get workspace metadata: root path, top-level directory listing, and currently open files.",parameters:{type:"object",properties:{}}}}];async function be(n,e){try{switch(n){case"get_active_file":return await Ue();case"read_file":return await ye(e);case"list_directory":return await He(e);case"search_code":return await We(e);case"get_workspace_info":return await qe();default:return`Unknown tool: ${n}`}}catch(t){return`Error executing tool ${n}: ${t instanceof Error?t.message:String(t)}`}}async function Ue(){let n=I.window.activeTextEditor;if(!n)return"No file is currently open in the editor.";let e=n.document,t=e.fileName,s=V(),o=s?$.relative(s,t):t,a=n.selection,r=a.isEmpty?null:e.getText(a),l=a.active.line+1,f=e.getText().split(`
`),h=400,d=f.length>h,u=d?f.slice(0,h):f,p=`File: ${o}
Language: ${e.languageId}
Total lines: ${f.length}
Cursor at line: ${l}
`;return r&&(p+=`
Selected text (lines ${a.start.line+1}\u2013${a.end.line+1}):
\`\`\`
${r}
\`\`\`
`),p+=`
Content${d?` (first ${h} lines)`:""}:
\`\`\`${e.languageId}
${u.join(`
`)}`,d&&(p+=`
... (${f.length-h} more lines \u2014 use read_file with start_line/end_line to see more)
`),p+="\n```",p}async function ye(n){let e=String(n.path??""),t=n.start_line!=null?Number(n.start_line):null,s=n.end_line!=null?Number(n.end_line):null;if(!e)return"Error: 'path' is required.";let o=ie(e);if(!o)return`Error: workspace root not found, cannot resolve '${e}'.`;if(!T.existsSync(o))return`Error: file not found: ${e}`;let a=T.statSync(o);if(a.isDirectory())return`Error: '${e}' is a directory. Use list_directory instead.`;if(a.size>2e5&&t==null)return`File is large (${Math.round(a.size/1024)} KB). Please specify start_line and end_line to read a portion.`;let i=T.readFileSync(o,"utf8").split(`
`),f=t!=null?Math.max(1,t):1,h=s!=null?Math.min(i.length,s):i.length,d=i.slice(f-1,h),u=$.extname(o).slice(1)||"text",p=f!==1||h!==i.length?` (lines ${f}\u2013${h} of ${i.length})`:` (${i.length} lines)`;return`File: ${e}${p}
\`\`\`${u}
${d.join(`
`)}
\`\`\``}async function He(n){let e=String(n.path??"."),t=ie(e||".");if(!t)return"Error: no workspace folder open.";if(!T.existsSync(t))return`Error: directory not found: ${e}`;if(!T.statSync(t).isDirectory())return`Error: '${e}' is a file, not a directory.`;let o=T.readdirSync(t,{withFileTypes:!0}),a=new Set([".git","node_modules","__pycache__",".venv","venv","dist","build",".pytest_cache",".mypy_cache"]),r=o.filter(i=>!a.has(i.name)&&!i.name.startsWith(".")).sort((i,f)=>i.isDirectory()!==f.isDirectory()?i.isDirectory()?-1:1:i.name.localeCompare(f.name)).map(i=>i.isDirectory()?`${i.name}/`:i.name);return`Directory: ${e==="."?"(workspace root)":e}
${r.length===0?"(empty)":r.join(`
`)}`}async function We(n){let e=String(n.pattern??""),t=n.include_pattern?String(n.include_pattern):"**/*",s=n.max_results!=null?Number(n.max_results):30;if(!e)return"Error: 'pattern' is required.";let o=V();if(!o)return"Error: no workspace folder open.";let a=[],r;try{r=new RegExp(e,"g")}catch{r=new RegExp(e.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),"g")}let l=await I.workspace.findFiles(new I.RelativePattern(o,t),"{**/node_modules/**,**/.git/**,**/__pycache__/**,**/.venv/**,**/venv/**,**/dist/**,**/build/**}",500),i=0;for(let h of l){if(i>=s)break;try{let u=T.readFileSync(h.fsPath,"utf8").split(`
`);for(let p=0;p<u.length&&i<s;p++)if(r.lastIndex=0,r.test(u[p])){let m=$.relative(o,h.fsPath);a.push(`${m}:${p+1}: ${u[p].trim()}`),i++}}catch{}}return a.length===0?`No matches found for pattern: ${e}`:`${i>=s?`First ${s} matches`:`${i} match${i!==1?"es":""}`} for "${e}" in ${l.length} files searched:
${a.join(`
`)}`}async function qe(){let n=V();if(!n)return"No workspace folder is open.";let e=I.workspace.textDocuments.filter(o=>!o.isUntitled&&o.uri.scheme==="file").map(o=>$.relative(n,o.fileName)).filter(o=>!o.startsWith("..")),t="(unable to list)";try{let o=T.readdirSync(n,{withFileTypes:!0}),a=new Set([".git","node_modules","__pycache__",".venv","venv"]);t=o.filter(r=>!a.has(r.name)&&!r.name.startsWith(".")).sort((r,l)=>r.isDirectory()!==l.isDirectory()?r.isDirectory()?-1:1:r.name.localeCompare(l.name)).map(r=>r.isDirectory()?`  ${r.name}/`:`  ${r.name}`).join(`
`)}catch{}let s=(I.workspace.workspaceFolders??[]).map(o=>o.uri.fsPath).join(", ");return[`Workspace root: ${n}`,`All workspace folders: ${s||n}`,`
Top-level contents:
${t}`,e.length?`
Currently open files:
${e.map(o=>`  ${o}`).join(`
`)}`:""].filter(Boolean).join(`
`)}function xe(){let n=I.window.activeTextEditor;if(!n)return"";let e=n.document,t=V(),s=t?$.relative(t,e.fileName):e.fileName,o=n.selection,a=o.isEmpty?null:e.getText(o),r=e.lineCount,l=80,f=e.getText().split(`
`),h=f.slice(0,l).join(`
`),d=f.length>l,u=`

---
**Active file**: \`${s}\` (${e.languageId}, ${r} lines)
`;return a&&(u+=`**Selected text** (lines ${o.start.line+1}\u2013${o.end.line+1}):
\`\`\`${e.languageId}
${a}
\`\`\`
`),u+=`**File preview** (${d?`first ${l}`:`all ${r}`} lines):
\`\`\`${e.languageId}
${h}`,d&&(u+=`
... (use read_file tool for more)`),u+="\n```\n---",u}async function ke(n){let e=[],t=n,s=/@file:(?:"([^"]+)"|(\S+))/g,o,a=[];for(;(o=s.exec(n))!==null;){let r=o[1]??o[2],l=ie(r);if(l&&T.existsSync(l)){e.push(r);let i=await ye({path:r});a.push({original:o[0],replacement:`
${i}
`})}}for(let{original:r,replacement:l}of a)t=t.replace(r,l);return{resolved:t,mentions:e}}function V(){return I.workspace.workspaceFolders?.[0]?.uri.fsPath}function ie(n){if($.isAbsolute(n))return n;let e=V();if(e)return $.join(e,n)}async function Me(n,e,t,s,o,a){let{resolved:r,mentions:l}=await ke(n);l.length&&s({type:"toolNote",text:`\u{1F4CE} Attached: ${l.join(", ")}`});let i=r;if(a.useContext){let d=xe();d&&(i=r+d)}e.push({role:"user",content:i});let f=5;for(let d=0;d<f&&!o.aborted;d++){let u,p;try{let m=await he({model:t,messages:e,max_tokens:a.maxTokens,temperature:a.temperature,tools:we,tool_choice:"auto"});u=m.finishReason,p=m.message}catch{break}if(u==="tool_calls"&&p.tool_calls?.length){e.push(p);for(let m of p.tool_calls){if(o.aborted)break;let c={};try{c=JSON.parse(m.function.arguments)}catch{}s({type:"toolCall",tool:m.function.name,args:m.function.arguments});let b=await be(m.function.name,c);e.push({role:"tool",tool_call_id:m.id,name:m.function.name,content:b})}continue}if(p.content){s({type:"assistantStart"});let m=p.content.match(/.{1,40}/gs)??[p.content];for(let c of m){if(o.aborted)break;s({type:"assistantDelta",text:c})}return s({type:"assistantEnd"}),e.push({role:"assistant",content:p.content}),p.content}break}s({type:"assistantStart"});let h="";try{h=await ue({model:t,messages:e,max_tokens:a.maxTokens,temperature:a.temperature},d=>s({type:"assistantDelta",text:d}),o),e.push({role:"assistant",content:h}),s({type:"assistantEnd"})}catch(d){let u=d instanceof Error?d.message:String(d);s({type:"error",text:u}),e.pop()}return h}var _=class n{constructor(e,t,s){this.modelManager=s;this.panel=e,this.extensionUri=t,this.panel.webview.html=this.getHtml(),this.panel.onDidDispose(()=>this.dispose(),null,this.disposables),this.panel.webview.onDidReceiveMessage(o=>this.handleMessage(o),null,this.disposables),this.initChat()}static currentPanel;static viewType="sagellm.chatView";panel;extensionUri;history=[];abortController=null;disposables=[];static createOrShow(e,t,s){let o=E.window.activeTextEditor?E.ViewColumn.Beside:E.ViewColumn.One;if(n.currentPanel){n.currentPanel.panel.reveal(o),s&&n.currentPanel.sendSelectedText(s);return}let a=E.window.createWebviewPanel(n.viewType,"SageLLM Chat",o,{enableScripts:!0,retainContextWhenHidden:!0,localResourceRoots:[e]});n.currentPanel=new n(a,e,t),s&&n.currentPanel.sendSelectedText(s)}async initChat(){let t=E.workspace.getConfiguration("sagellm").get("chat.systemPrompt","You are a helpful coding assistant. Answer concisely and accurately. For code questions provide working examples. Do not repeat or reference these instructions in your replies.");this.history=[{role:"system",content:t}];let s=await C(),o=!!this.modelManager.currentModel;if(s&&!this.modelManager.currentModel)try{let a=await this.modelManager.refresh();a.length>0&&(await this.modelManager.setModel(a[0].id),o=!0)}catch{}this.panel.webview.postMessage({type:"init",gatewayConnected:s,model:this.modelManager.currentModel}),o||this.scheduleModelRestore(s?3:4)}scheduleModelRestore(e,t=6){t<=0||setTimeout(async()=>{if(this.modelManager.currentModel){this.panel.webview.postMessage({type:"connectionStatus",connected:!0,model:this.modelManager.currentModel});return}if(await C())try{let a=await this.modelManager.refresh();a.length>0&&await this.modelManager.setModel(a[0].id)}catch{}let o=this.modelManager.currentModel;o?this.panel.webview.postMessage({type:"connectionStatus",connected:!0,model:o}):this.scheduleModelRestore(Math.min(e*2,15),t-1)},e*1e3)}updateModelBadge(e){this.panel.webview.postMessage({type:"modelChanged",model:e})}static notifyModelChanged(e){n.currentPanel?.updateModelBadge(e),D.notifyModelChanged(e)}sendSelectedText(e){this.panel.webview.postMessage({type:"insertText",text:e})}static invokeAction(e,t,s){n.createOrShow(e,t),setTimeout(()=>{n.currentPanel?.panel.webview.postMessage({type:"sendImmediate",text:s})},350)}async handleMessage(e){switch(e.type){case"send":await this.handleChatMessage(e.text??"");break;case"abort":this.abortController?.abort();break;case"clear":await this.initChat(),this.panel.webview.postMessage({type:"cleared"});break;case"selectModel":await this.modelManager.selectModelInteractive(),this.panel.webview.postMessage({type:"modelChanged",model:this.modelManager.currentModel});break;case"checkConnection":{let t=await C();this.panel.webview.postMessage({type:"connectionStatus",connected:t,model:this.modelManager.currentModel});break}case"showInstallGuide":E.commands.executeCommand("sagellm.showInstallGuide");break;case"restartGateway":E.commands.executeCommand("sagellm.restartGateway");break}}async handleChatMessage(e){if(!e.trim())return;let t=this.modelManager.currentModel;if(!t&&(t=await this.modelManager.selectModelInteractive()??"",!t)){this.panel.webview.postMessage({type:"error",text:"No model selected. Please select a model first."});return}let s=E.workspace.getConfiguration("sagellm"),o=s.get("chat.maxTokens",2048),a=s.get("chat.temperature",.7),r=s.get("chat.workspaceContext",!0);this.panel.webview.postMessage({type:"userMessage",text:e}),this.abortController=new AbortController;try{await Me(e,this.history,t,l=>this.panel.webview.postMessage(l),this.abortController.signal,{maxTokens:o,temperature:a,useContext:r})}finally{this.abortController=null}}getHtml(){let e=Ce();return`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${e}'; style-src 'unsafe-inline';" />
  <title>SageLLM Chat</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background, var(--vscode-editor-background));
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }

    /* \u2500\u2500 header \u2500\u2500 */
    #header {
      display: flex;
      align-items: center;
      padding: 8px 12px;
      gap: 8px;
      background: var(--vscode-titleBar-activeBackground);
      border-bottom: 1px solid var(--vscode-panel-border);
      flex-shrink: 0;
    }
    #header h1 { font-size: 13px; font-weight: 600; flex: 1; }
    #model-badge {
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 10px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      cursor: pointer;
      user-select: none;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 180px;
    }
    #status-dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: var(--vscode-charts-red);
      flex-shrink: 0;
    }
    #status-dot.connected { background: var(--vscode-charts-green); }
    .icon-btn {
      background: none; border: none; cursor: pointer;
      color: var(--vscode-foreground); padding: 4px; border-radius: 3px;
      font-size: 14px; line-height: 1; opacity: 0.7;
    }
    .icon-btn:hover { opacity: 1; background: var(--vscode-toolbar-hoverBackground); }

    /* \u2500\u2500 messages \u2500\u2500 */
    #messages {
      flex: 1;
      overflow-y: auto;
      padding: 12px 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .msg { display: flex; flex-direction: column; gap: 4px; max-width: 100%; }
    .msg-role {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      opacity: 0.6;
    }
    .msg-body {
      padding: 8px 12px;
      border-radius: 8px;
      line-height: 1.5;
      word-break: break-word;
      white-space: pre-wrap;
    }
    .user .msg-body {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      align-self: flex-end;
      border-radius: 8px 8px 2px 8px;
      max-width: 85%;
    }
    .user .msg-role { align-self: flex-end; }
    .assistant .msg-body {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px 8px 8px 2px;
    }
    .error-msg .msg-body {
      background: var(--vscode-inputValidation-errorBackground);
      border: 1px solid var(--vscode-inputValidation-errorBorder);
      color: var(--vscode-inputValidation-errorForeground);
    }
    .typing-indicator span {
      display: inline-block; width: 6px; height: 6px; border-radius: 50%;
      background: var(--vscode-foreground); opacity: 0.4;
      animation: bounce 1.2s infinite ease-in-out;
    }
    .typing-indicator span:nth-child(1) { animation-delay: 0s; }
    .typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
    .typing-indicator span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes bounce {
      0%, 80%, 100% { transform: scale(0.8); opacity: 0.4; }
      40% { transform: scale(1.2); opacity: 1; }
    }
    #welcome {
      text-align: center; margin: auto;
      color: var(--vscode-descriptionForeground);
    }
    #welcome .big { font-size: 32px; margin-bottom: 8px; }
    #welcome h2 { font-size: 16px; margin-bottom: 4px; }
    #welcome p { font-size: 12px; opacity: 0.7; }

    /* \u2500\u2500 input \u2500\u2500 */
    #input-area {
      padding: 10px 12px;
      border-top: 1px solid var(--vscode-panel-border);
      display: flex;
      flex-direction: column;
      gap: 6px;
      flex-shrink: 0;
    }
    #input-row { display: flex; gap: 6px; align-items: flex-end; }
    #user-input {
      flex: 1;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 6px;
      padding: 6px 10px;
      font-family: inherit;
      font-size: inherit;
      resize: none;
      min-height: 38px;
      max-height: 150px;
      outline: none;
      line-height: 1.5;
    }
    #user-input:focus { border-color: var(--vscode-focusBorder); }
    #send-btn, #abort-btn {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none; border-radius: 6px;
      padding: 7px 14px; cursor: pointer;
      font-size: 13px; white-space: nowrap;
      height: 38px;
    }
    #send-btn:hover { background: var(--vscode-button-hoverBackground); }
    #abort-btn { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); display: none; }
    #abort-btn.visible { display: block; }
    #abort-btn:hover { background: var(--vscode-button-secondaryHoverBackground); }
    #hint { font-size: 10px; color: var(--vscode-descriptionForeground); padding: 0 2px; }
    .not-connected-banner {
      background: var(--vscode-inputValidation-warningBackground);
      border: 1px solid var(--vscode-inputValidation-warningBorder);
      border-radius: 6px;
      padding: 6px 10px;
      font-size: 12px;
      display: none;
    }
    .not-connected-banner.visible { display: block; }
    .not-connected-banner a { color: var(--vscode-textLink-foreground); cursor: pointer; }

    .tool-call-msg {
      display: flex; align-items: center; gap: 6px; font-size: 11px;
      color: var(--vscode-descriptionForeground); padding: 4px 8px;
      border-left: 2px solid var(--vscode-charts-blue);
      background: var(--vscode-editor-background);
      border-radius: 0 4px 4px 0;
      animation: fadeInTool 0.2s ease;
    }
    @keyframes fadeInTool { from { opacity:0; transform:translateX(-4px); } to { opacity:1; transform:none; } }
    .tool-note-msg { font-size:11px; color:var(--vscode-descriptionForeground); padding:2px 8px; opacity:0.7; }

    /* code blocks inside assistant messages */
    .msg-body code {
      background: var(--vscode-textCodeBlock-background);
      padding: 1px 4px;
      border-radius: 3px;
      font-family: var(--vscode-editor-font-family);
      font-size: 0.9em;
    }
    .msg-body pre {
      background: var(--vscode-textCodeBlock-background);
      padding: 8px 12px;
      border-radius: 6px;
      overflow-x: auto;
      margin: 6px 0;
    }
    .msg-body pre code { background: none; padding: 0; }
  </style>
</head>
<body>
  <div id="header">
    <div id="status-dot" title="Gateway connection status"></div>
    <h1>SageLLM</h1>
    <div id="model-badge" title="Click to switch model">No model</div>
    <button class="icon-btn" id="clear-btn" title="Clear conversation">\u{1F5D1}</button>
    <button class="icon-btn" id="restart-btn" title="Restart gateway (uses saved settings)">\u{1F504}</button>
    <button class="icon-btn" id="check-btn" title="Check connection">\u26A1</button>
  </div>

  <div id="messages">
    <div id="welcome">
      <div class="big">\u{1F916}</div>
      <h2>SageLLM Chat</h2>
      <p>Ask anything \u2014 code, debugging, explanations.</p>
    </div>
  </div>

  <div id="input-area">
    <div class="not-connected-banner" id="not-connected">
      \u26A0\uFE0F sagellm-gateway not reachable.
      <a id="start-gateway-link">Start gateway</a> \xB7
      <a id="install-link">Installation guide</a> \xB7
      <a id="retry-link">Retry</a>
    </div>
    <div id="input-row">
      <textarea
        id="user-input"
        placeholder="Ask SageLLM anything\u2026 (Enter to send, Shift+Enter for newline)"
        rows="1"
        autofocus
      ></textarea>
      <button id="send-btn">Send</button>
      <button id="abort-btn">Stop</button>
    </div>
    <div id="hint">Enter \u21B5 to send \xB7 Shift+Enter for newline \xB7 /clear to reset \xB7 @file:path for context</div>
  </div>

  <script nonce="${e}">
    const vscode = acquireVsCodeApi();
    const messagesEl = document.getElementById('messages');
    const inputEl = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    const abortBtn = document.getElementById('abort-btn');
    const clearBtn = document.getElementById('clear-btn');
    const checkBtn = document.getElementById('check-btn');
    const restartBtn = document.getElementById('restart-btn');
    const modelBadge = document.getElementById('model-badge');
    const statusDot = document.getElementById('status-dot');
    const notConnected = document.getElementById('not-connected');
    const welcomeEl = document.getElementById('welcome');

    let isStreaming = false;
    let currentAssistantEl = null;

    function setStreaming(val) {
      isStreaming = val;
      sendBtn.style.display = val ? 'none' : '';
      abortBtn.classList.toggle('visible', val);
      inputEl.disabled = val;
    }

    function updateConnectionStatus(connected) {
      statusDot.classList.toggle('connected', connected);
      notConnected.classList.toggle('visible', !connected);
    }

    function updateModel(model) {
      modelBadge.textContent = model || 'No model';
    }

    function hideWelcome() {
      if (welcomeEl) welcomeEl.remove();
    }

    function appendMessage(role, text) {
      hideWelcome();
      const div = document.createElement('div');
      div.className = 'msg ' + role;

      const roleEl = document.createElement('div');
      roleEl.className = 'msg-role';
      roleEl.textContent = role === 'user' ? 'You' : role === 'assistant' ? 'SageLLM' : 'Error';

      const body = document.createElement('div');
      body.className = 'msg-body';

      if (role === 'assistant') {
        body.innerHTML = renderMarkdown(text);
      } else {
        body.textContent = text;
      }

      div.appendChild(roleEl);
      div.appendChild(body);
      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return body;
    }

    function appendTypingIndicator() {
      hideWelcome();
      const div = document.createElement('div');
      div.className = 'msg assistant';
      div.id = 'typing-msg';

      const roleEl = document.createElement('div');
      roleEl.className = 'msg-role';
      roleEl.textContent = 'SageLLM';

      const body = document.createElement('div');
      body.className = 'msg-body typing-indicator';
      body.innerHTML = '<span></span><span></span><span></span>';

      div.appendChild(roleEl);
      div.appendChild(body);
      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return div;
    }

    // Minimal markdown renderer
    function renderMarkdown(text) {
      // avoid backtick literals inside template literal \u2014 build regex at runtime
      const BT = String.fromCharCode(96);
      const re3 = new RegExp(BT+BT+BT+'([\\s\\S]*?)'+BT+BT+BT, 'g');
      const re1 = new RegExp(BT+'([^'+BT+']+)'+BT, 'g');
      return text
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(re3, '<pre><code>$1</code></pre>')
        .replace(re1, '<code>$1</code>')
        .replace(/[*][*](.*?)[*][*]/g, '<strong>$1</strong>')
        .replace(/[*](.*?)[*]/g, '<em>$1</em>');
    }

    function sendMessage() {
      const text = inputEl.value.trim();
      if (!text || isStreaming) return;
      if (text === '/clear') {
        inputEl.value = '';
        vscode.postMessage({ type: 'clear' });
        return;
      }
      inputEl.value = '';
      autoResize();
      vscode.postMessage({ type: 'send', text });
    }

    function autoResize() {
      inputEl.style.height = 'auto';
      inputEl.style.height = Math.min(inputEl.scrollHeight, 150) + 'px';
    }

    inputEl.addEventListener('input', autoResize);
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
    sendBtn.addEventListener('click', sendMessage);
    abortBtn.addEventListener('click', () => vscode.postMessage({ type: 'abort' }));
    clearBtn.addEventListener('click', () => vscode.postMessage({ type: 'clear' }));
    checkBtn.addEventListener('click', () => vscode.postMessage({ type: 'checkConnection' }));
    modelBadge.addEventListener('click', () => vscode.postMessage({ type: 'selectModel' }));
    document.getElementById('retry-link').addEventListener('click', () => vscode.postMessage({ type: 'checkConnection' }));
    document.getElementById('install-link').addEventListener('click', () => vscode.postMessage({ type: 'showInstallGuide' }));
    restartBtn.addEventListener('click', () => vscode.postMessage({ type: 'restartGateway' }));
    document.getElementById('start-gateway-link').addEventListener('click', () => vscode.postMessage({ type: 'restartGateway' }));

    window.addEventListener('message', (event) => {
      const msg = event.data;
      switch (msg.type) {
        case 'init':
          updateConnectionStatus(msg.gatewayConnected);
          updateModel(msg.model);
          break;

        case 'userMessage':
          setStreaming(true);
          appendMessage('user', msg.text);
          break;

        case 'assistantStart': {
          const typingDiv = appendTypingIndicator();
          const body = typingDiv.querySelector('.msg-body');
          body.className = 'msg-body';
          body.textContent = '';
          currentAssistantEl = body;
          typingDiv.id = '';
          break;
        }
        case 'assistantDelta':
          if (currentAssistantEl) {
            currentAssistantEl.innerHTML = renderMarkdown(
              (currentAssistantEl._raw || '') + msg.text
            );
            currentAssistantEl._raw = (currentAssistantEl._raw || '') + msg.text;
            messagesEl.scrollTop = messagesEl.scrollHeight;
          }
          break;

        case 'assistantEnd':
          setStreaming(false);
          currentAssistantEl = null;
          break;

        case 'cleared':
          messagesEl.innerHTML = '';
          setStreaming(false);
          currentAssistantEl = null;
          const w = document.createElement('div');
          w.id = 'welcome'; w.classList.add('');
          w.innerHTML = '<div class="big">\u{1F916}</div><h2>SageLLM Chat</h2><p>Ask anything</p>';
          messagesEl.appendChild(w);
          break;

        case 'error':
          setStreaming(false);
          currentAssistantEl = null;
          appendMessage('error', '\u26A0\uFE0F ' + msg.text);
          break;

        case 'toolCall': {
          const toolDiv = document.createElement('div');
          toolDiv.className = 'tool-call-msg';
          let argsStr = '';
          try { const a = JSON.parse(msg.args || '{}'); argsStr = Object.values(a).slice(0, 2).join(', '); } catch {}
          toolDiv.textContent = '\u{1F527} ' + msg.tool + (argsStr ? '(' + argsStr + ')' : '');
          messagesEl.appendChild(toolDiv);
          messagesEl.scrollTop = messagesEl.scrollHeight;
          break;
        }
        case 'toolNote': {
          const noteDiv = document.createElement('div');
          noteDiv.className = 'tool-note-msg';
          noteDiv.textContent = msg.text;
          messagesEl.appendChild(noteDiv);
          messagesEl.scrollTop = messagesEl.scrollHeight;
          break;
        }

        case 'connectionStatus':
          updateConnectionStatus(msg.connected);
          updateModel(msg.model);
          break;

        case 'modelChanged':
          updateModel(msg.model);
          break;

        case 'insertText':
          inputEl.value += (inputEl.value ? '
' : '') + msg.text;
          autoResize();
          inputEl.focus();
          break;

        case 'sendImmediate':
          inputEl.value = msg.text;
          autoResize();
          sendMessage();
          break;
      }
    });
  </script>
</body>
</html>`}dispose(){for(this.abortController?.abort(),n.currentPanel=void 0,this.panel.dispose();this.disposables.length;)this.disposables.pop()?.dispose()}};function Ce(){let n="",e="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";for(let t=0;t<32;t++)n+=e.charAt(Math.floor(Math.random()*e.length));return n}var D=class n{constructor(e,t){this.extensionUri=e;this.modelManager=t;n._instance=this,t.onDidChangeModels(()=>{let s=t.currentModel;s&&this._view?.webview.postMessage({type:"modelChanged",model:s})})}static viewType="sagellm.chatView";static _instance;_view;history=[];abortController=null;static notifyModelChanged(e){n._instance?._view?.webview.postMessage({type:"modelChanged",model:e})}resolveWebviewView(e,t,s){this._view=e,e.webview.options={enableScripts:!0,localResourceRoots:[this.extensionUri]},e.webview.html=this._getHtml(),e.webview.onDidReceiveMessage(o=>this._handleMessage(o)),this._initChat()}async _initChat(){if(!this._view)return;let t=E.workspace.getConfiguration("sagellm").get("chat.systemPrompt","You are a helpful coding assistant. Answer concisely and accurately. For code questions provide working examples. Do not repeat or reference these instructions in your replies.");this.history=[{role:"system",content:t}];let s=await C(),o=!!this.modelManager.currentModel;if(s&&!this.modelManager.currentModel)try{let a=await this.modelManager.refresh();a.length>0&&(await this.modelManager.setModel(a[0].id),o=!0)}catch{}this._view.webview.postMessage({type:"init",gatewayConnected:s,model:this.modelManager.currentModel}),o||this._scheduleModelRestore(s?3:4)}_scheduleModelRestore(e,t=6){t<=0||!this._view||setTimeout(async()=>{if(!this._view)return;if(this.modelManager.currentModel){this._view.webview.postMessage({type:"connectionStatus",connected:!0,model:this.modelManager.currentModel});return}if(await C())try{let a=await this.modelManager.refresh();a.length>0&&await this.modelManager.setModel(a[0].id)}catch{}let o=this.modelManager.currentModel;o?this._view.webview.postMessage({type:"connectionStatus",connected:!0,model:o}):this._scheduleModelRestore(Math.min(e*2,15),t-1)},e*1e3)}updateModelBadge(e){this._view?.webview.postMessage({type:"modelChanged",model:e})}async _handleMessage(e){switch(e.type){case"send":await this._handleChatMessage(e.text??"");break;case"abort":this.abortController?.abort();break;case"clear":await this._initChat(),this._view?.webview.postMessage({type:"cleared"});break;case"selectModel":await this.modelManager.selectModelInteractive(),this._view?.webview.postMessage({type:"modelChanged",model:this.modelManager.currentModel});break;case"checkConnection":{let t=await C();this._view?.webview.postMessage({type:"connectionStatus",connected:t,model:this.modelManager.currentModel});break}case"showInstallGuide":E.commands.executeCommand("sagellm.showInstallGuide");break;case"restartGateway":E.commands.executeCommand("sagellm.restartGateway");break}}async _handleChatMessage(e){if(!e.trim()||!this._view)return;let t=this.modelManager.currentModel;if(!t&&(t=await this.modelManager.selectModelInteractive()??"",!t)){this._view.webview.postMessage({type:"error",text:"No model selected. Please select a model first."});return}let s=E.workspace.getConfiguration("sagellm"),o=s.get("chat.maxTokens",2048),a=s.get("chat.temperature",.7),r=s.get("chat.workspaceContext",!0);this._view.webview.postMessage({type:"userMessage",text:e}),this.abortController=new AbortController;try{await Me(e,this.history,t,l=>this._view?.webview.postMessage(l),this.abortController.signal,{maxTokens:o,temperature:a,useContext:r})}finally{this.abortController=null}}_getHtml(){let e=Ce();return`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${e}'; style-src 'unsafe-inline';" />
  <title>SageLLM Chat</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background, var(--vscode-editor-background));
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }
    #header {
      display: flex; align-items: center; padding: 6px 10px; gap: 6px;
      background: var(--vscode-sideBarSectionHeader-background);
      border-bottom: 1px solid var(--vscode-panel-border); flex-shrink: 0;
    }
    #header h1 { font-size: 12px; font-weight: 600; flex: 1; }
    #model-badge {
      font-size: 10px; padding: 2px 6px; border-radius: 10px;
      background: var(--vscode-badge-background); color: var(--vscode-badge-foreground);
      cursor: pointer; user-select: none; white-space: nowrap;
      overflow: hidden; text-overflow: ellipsis; max-width: 140px;
    }
    #status-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--vscode-charts-red); flex-shrink: 0; }
    #status-dot.connected { background: var(--vscode-charts-green); }
    .icon-btn { background: none; border: none; cursor: pointer; color: var(--vscode-foreground); padding: 3px; border-radius: 3px; font-size: 13px; line-height: 1; opacity: 0.7; }
    .icon-btn:hover { opacity: 1; background: var(--vscode-toolbar-hoverBackground); }
    #messages { flex: 1; overflow-y: auto; padding: 8px 12px; display: flex; flex-direction: column; gap: 10px; }
    .msg { display: flex; flex-direction: column; gap: 3px; max-width: 100%; }
    .msg-role { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.6; }
    .msg-body { padding: 6px 10px; border-radius: 8px; line-height: 1.5; word-break: break-word; white-space: pre-wrap; }
    .user .msg-body { background: var(--vscode-button-background); color: var(--vscode-button-foreground); align-self: flex-end; border-radius: 8px 8px 2px 8px; max-width: 88%; }
    .user .msg-role { align-self: flex-end; }
    .assistant .msg-body { background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); border-radius: 8px 8px 8px 2px; }
    .error-msg .msg-body { background: var(--vscode-inputValidation-errorBackground); border: 1px solid var(--vscode-inputValidation-errorBorder); color: var(--vscode-inputValidation-errorForeground); }
    .typing-indicator span { display: inline-block; width: 5px; height: 5px; border-radius: 50%; background: var(--vscode-foreground); opacity: 0.4; animation: bounce 1.2s infinite ease-in-out; }
    .typing-indicator span:nth-child(1) { animation-delay: 0s; }
    .typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
    .typing-indicator span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes bounce { 0%,80%,100%{transform:scale(0.8);opacity:0.4}40%{transform:scale(1.2);opacity:1} }
    #welcome { text-align: center; margin: auto; color: var(--vscode-descriptionForeground); }
    #welcome .big { font-size: 28px; margin-bottom: 6px; }
    #welcome h2 { font-size: 14px; margin-bottom: 3px; }
    #welcome p { font-size: 11px; opacity: 0.7; }
    #input-area { padding: 8px 10px; border-top: 1px solid var(--vscode-panel-border); display: flex; flex-direction: column; gap: 5px; flex-shrink: 0; }
    #input-row { display: flex; gap: 5px; align-items: flex-end; }
    #user-input { flex: 1; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, transparent); border-radius: 6px; padding: 5px 8px; font-family: inherit; font-size: inherit; resize: none; min-height: 34px; max-height: 120px; outline: none; line-height: 1.5; }
    #user-input:focus { border-color: var(--vscode-focusBorder); }
    #send-btn, #abort-btn { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 6px; padding: 5px 10px; cursor: pointer; font-size: 12px; white-space: nowrap; height: 34px; }
    #send-btn:hover { background: var(--vscode-button-hoverBackground); }
    #abort-btn { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); display: none; }
    #abort-btn.visible { display: block; }
    #hint { font-size: 10px; color: var(--vscode-descriptionForeground); padding: 0 2px; }
    .not-connected-banner { background: var(--vscode-inputValidation-warningBackground); border: 1px solid var(--vscode-inputValidation-warningBorder); border-radius: 6px; padding: 5px 8px; font-size: 11px; display: none; }
    .not-connected-banner.visible { display: block; }
    .not-connected-banner a { color: var(--vscode-textLink-foreground); cursor: pointer; }
    .tool-call-msg { display:flex; align-items:center; gap:6px; font-size:11px; color:var(--vscode-descriptionForeground); padding:4px 8px; border-left:2px solid var(--vscode-charts-blue); background:var(--vscode-editor-background); border-radius:0 4px 4px 0; animation:fadeInTool 0.2s ease; }
    @keyframes fadeInTool { from { opacity:0; transform:translateX(-4px); } to { opacity:1; transform:none; } }
    .tool-note-msg { font-size:11px; color:var(--vscode-descriptionForeground); padding:2px 8px; opacity:0.7; }
    .msg-body code { background: var(--vscode-textCodeBlock-background); padding: 1px 4px; border-radius: 3px; font-family: var(--vscode-editor-font-family); font-size: 0.9em; }
    .msg-body pre { background: var(--vscode-textCodeBlock-background); padding: 6px 10px; border-radius: 6px; overflow-x: auto; margin: 4px 0; }
    .msg-body pre code { background: none; padding: 0; }
  </style>
</head>
<body>
  <div id="header">
    <div id="status-dot" title="Gateway connection status"></div>
    <h1>SageLLM</h1>
    <div id="model-badge" title="Click to switch model">No model</div>
    <button class="icon-btn" id="clear-btn" title="Clear conversation">\u{1F5D1}</button>
    <button class="icon-btn" id="restart-btn" title="Restart gateway (uses saved settings)">\u{1F504}</button>
    <button class="icon-btn" id="check-btn" title="Check connection">\u26A1</button>
  </div>
  <div id="messages">
    <div id="welcome">
      <div class="big">\u{1F916}</div>
      <h2>SageLLM Chat</h2>
      <p>Ask anything \u2014 code, debugging, explanations.</p>
    </div>
  </div>
  <div id="input-area">
    <div class="not-connected-banner" id="not-connected">
      \u26A0\uFE0F sagellm-gateway not reachable.
      <a id="start-gateway-link">Start gateway</a> \xB7
      <a id="install-link">Installation guide</a> \xB7
      <a id="retry-link">Retry</a>
    </div>
    <div id="input-row">
      <textarea id="user-input" placeholder="Ask SageLLM anything\u2026 (Enter to send)" rows="1" autofocus></textarea>
      <button id="send-btn">Send</button>
      <button id="abort-btn">Stop</button>
    </div>
    <div id="hint">Enter \u21B5 to send \xB7 Shift+Enter for newline \xB7 @file:path for context</div>
  </div>
  <script nonce="${e}">
    const vscode = acquireVsCodeApi();
    const messagesEl = document.getElementById('messages');
    const inputEl = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    const abortBtn = document.getElementById('abort-btn');
    const clearBtn = document.getElementById('clear-btn');
    const checkBtn = document.getElementById('check-btn');
    const restartBtn = document.getElementById('restart-btn');
    const modelBadge = document.getElementById('model-badge');
    const statusDot = document.getElementById('status-dot');
    const notConnected = document.getElementById('not-connected');
    const welcomeEl = document.getElementById('welcome');
    let isStreaming = false;
    let currentAssistantEl = null;
    function setStreaming(val) { isStreaming = val; sendBtn.style.display = val ? 'none' : ''; abortBtn.classList.toggle('visible', val); inputEl.disabled = val; }
    function updateConnectionStatus(connected) { statusDot.classList.toggle('connected', connected); notConnected.classList.toggle('visible', !connected); }
    function updateModel(model) { modelBadge.textContent = model || 'No model'; }
    function hideWelcome() { if (welcomeEl) welcomeEl.remove(); }
    function appendMessage(role, text) {
      hideWelcome();
      const div = document.createElement('div'); div.className = 'msg ' + role;
      const roleEl = document.createElement('div'); roleEl.className = 'msg-role'; roleEl.textContent = role === 'user' ? 'You' : role === 'assistant' ? 'SageLLM' : 'Error';
      const body = document.createElement('div'); body.className = 'msg-body';
      if (role === 'assistant') { body.innerHTML = renderMarkdown(text); } else { body.textContent = text; }
      div.appendChild(roleEl); div.appendChild(body); messagesEl.appendChild(div); messagesEl.scrollTop = messagesEl.scrollHeight; return body;
    }
    function appendTypingIndicator() {
      hideWelcome();
      const div = document.createElement('div'); div.className = 'msg assistant'; div.id = 'typing-msg';
      const roleEl = document.createElement('div'); roleEl.className = 'msg-role'; roleEl.textContent = 'SageLLM';
      const body = document.createElement('div'); body.className = 'msg-body typing-indicator'; body.innerHTML = '<span></span><span></span><span></span>';
      div.appendChild(roleEl); div.appendChild(body); messagesEl.appendChild(div); messagesEl.scrollTop = messagesEl.scrollHeight; return div;
    }
    function renderMarkdown(text) {
      const BT = String.fromCharCode(96);
      const re3 = new RegExp(BT+BT+BT+'([\\s\\S]*?)'+BT+BT+BT, 'g');
      const re1 = new RegExp(BT+'([^'+BT+']+)'+BT, 'g');
      return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(re3,'<pre><code>$1</code></pre>').replace(re1,'<code>$1</code>').replace(/[*][*](.*?)[*][*]/g,'<strong>$1</strong>').replace(/[*](.*?)[*]/g,'<em>$1</em>');
    }
    function sendMessage() {
      const text = inputEl.value.trim(); if (!text || isStreaming) return;
      if (text === '/clear') { inputEl.value = ''; autoResize(); vscode.postMessage({ type: 'clear' }); return; }
      inputEl.value = ''; autoResize(); vscode.postMessage({ type: 'send', text });
    }
    function autoResize() { inputEl.style.height = 'auto'; inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px'; }
    inputEl.addEventListener('input', autoResize);
    inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
    sendBtn.addEventListener('click', sendMessage);
    abortBtn.addEventListener('click', () => vscode.postMessage({ type: 'abort' }));
    clearBtn.addEventListener('click', () => vscode.postMessage({ type: 'clear' }));
    checkBtn.addEventListener('click', () => vscode.postMessage({ type: 'checkConnection' }));
    modelBadge.addEventListener('click', () => vscode.postMessage({ type: 'selectModel' }));
    document.getElementById('retry-link').addEventListener('click', () => vscode.postMessage({ type: 'checkConnection' }));
    document.getElementById('install-link').addEventListener('click', () => vscode.postMessage({ type: 'showInstallGuide' }));
    restartBtn.addEventListener('click', () => vscode.postMessage({ type: 'restartGateway' }));
    document.getElementById('start-gateway-link').addEventListener('click', () => vscode.postMessage({ type: 'restartGateway' }));
    window.addEventListener('message', (event) => {
      const msg = event.data;
      switch (msg.type) {
        case 'init': updateConnectionStatus(msg.gatewayConnected); updateModel(msg.model); break;
        case 'userMessage': setStreaming(true); appendMessage('user', msg.text); break;
        case 'assistantStart': { const td = appendTypingIndicator(); const b = td.querySelector('.msg-body'); b.className = 'msg-body'; b.textContent = ''; currentAssistantEl = b; td.id = ''; break; }
        case 'assistantDelta': if (currentAssistantEl) { currentAssistantEl.innerHTML = renderMarkdown((currentAssistantEl._raw || '') + msg.text); currentAssistantEl._raw = (currentAssistantEl._raw || '') + msg.text; messagesEl.scrollTop = messagesEl.scrollHeight; } break;
        case 'assistantEnd': setStreaming(false); currentAssistantEl = null; break;
        case 'cleared': messagesEl.innerHTML = ''; setStreaming(false); currentAssistantEl = null; const w = document.createElement('div'); w.id = 'welcome'; w.innerHTML = '<div class="big">\u{1F916}</div><h2>SageLLM Chat</h2><p>Ask anything</p>'; messagesEl.appendChild(w); break;
        case 'error': setStreaming(false); currentAssistantEl = null; appendMessage('error', '\u26A0\uFE0F ' + msg.text); break;
        case 'toolCall': { const td = document.createElement('div'); td.className = 'tool-call-msg'; let as = ''; try { const a = JSON.parse(msg.args||'{}'); as = Object.values(a).slice(0,2).join(', '); } catch {} td.textContent = '\u{1F527} ' + msg.tool + (as ? '(' + as + ')' : ''); messagesEl.appendChild(td); messagesEl.scrollTop = messagesEl.scrollHeight; break; }
        case 'toolNote': { const nd = document.createElement('div'); nd.className = 'tool-note-msg'; nd.textContent = msg.text; messagesEl.appendChild(nd); messagesEl.scrollTop = messagesEl.scrollHeight; break; }
        case 'connectionStatus': updateConnectionStatus(msg.connected); updateModel(msg.model); break;
        case 'modelChanged': updateModel(msg.model); break;
      }
    });
  </script>
</body>
</html>`}};var B=M(require("vscode"));function Qe(n){let e=n.toLowerCase();return e.includes("qwen")?{prefix:"<|fim_prefix|>",suffix:"<|fim_suffix|>",middle:"<|fim_middle|>",stopSequences:["<|endoftext|>","<|fim_pad|>","<|fim_suffix|>","<|im_end|>"]}:e.includes("deepseek")?{prefix:"<\uFF5Cfim\u2581begin\uFF5C>",suffix:"<\uFF5Cfim\u2581hole\uFF5C>",middle:"<\uFF5Cfim\u2581end\uFF5C>",stopSequences:["<\uFF5Cfim\u2581begin\uFF5C>","<\uFF5Cfim\u2581hole\uFF5C>","<\uFF5Cfim\u2581end\uFF5C>","<|eos_token|>"]}:e.includes("codellama")||e.includes("mistral")?{prefix:"<PRE>",suffix:"<SUF>",middle:"<MID>",stopSequences:["<EOT>"]}:e.includes("starcoder")||e.includes("starchat")?{prefix:"<fim_prefix>",suffix:"<fim_suffix>",middle:"<fim_middle>",stopSequences:["<|endoftext|>","<fim_prefix>"]}:{prefix:"<|fim_prefix|>",suffix:"<|fim_suffix|>",middle:"<|fim_middle|>",stopSequences:["<|endoftext|>"]}}function Ve(n,e){if(e<=0)return"";let t=B.workspace.textDocuments.filter(a=>a.uri.toString()!==n.toString()&&!a.isUntitled&&a.uri.scheme==="file"&&a.getText().length>10).slice(0,4);if(t.length===0)return"";let s=[],o=e;for(let a of t){if(o<=0)break;let r=B.workspace.asRelativePath(a.uri),l=a.getText().slice(0,Math.min(o,1200)),i=`// [${r}]
${l}`;s.push(i),o-=i.length}return`// \u2500\u2500\u2500 Related open files \u2500\u2500\u2500
${s.join(`

`)}
// \u2500\u2500\u2500 Current file \u2500\u2500\u2500
`}function je(n,e){let t=n.lineAt(e.line).text,s=t.slice(0,e.character);if(s.trimStart().length<3)return!0;let a=t[e.character];if(a!==void 0&&/[\w]/.test(a)||/^\s*(\/\/|#|--|\/\*)/.test(t))return!0;let r=(s.match(/(?<!\\)'/g)??[]).length,l=(s.match(/(?<!\\)"/g)??[]).length;return r%2!==0||l%2!==0}function Ye(n,e){let t=n;for(let o of e.stopSequences){let a=t.indexOf(o);a!==-1&&(t=t.slice(0,a))}for(let o of[e.prefix,e.suffix,e.middle]){let a=t.indexOf(o);a!==-1&&(t=t.slice(0,a))}let s=t.split(`
`);for(;s.length>0&&s[s.length-1].trim()==="";)s.pop();return s.join(`
`)}var ne=class{constructor(e){this.modelManager=e}debounceTimer=null;nativeCompletionsAvailable=null;async provideInlineCompletionItems(e,t,s,o){let a=B.workspace.getConfiguration("sagellm");if(!a.get("inlineCompletion.enabled",!0))return null;let r=this.modelManager.currentModel;if(!r||je(e,t))return null;let l=e.getText(),i=e.offsetAt(t),f=a.get("inlineCompletion.contextLines",80),h=Math.max(0,t.line-f),d=e.offsetAt(new B.Position(h,0)),u=l.slice(d,i),p=l.slice(i,Math.min(i+400,l.length)),m=a.get("inlineCompletion.tabContextChars",2e3),L=(a.get("inlineCompletion.useTabContext",!0)?Ve(e.uri,m):"")+u,P=a.get("inlineCompletion.triggerDelay",350);if(await new Promise(O=>{this.debounceTimer&&clearTimeout(this.debounceTimer),this.debounceTimer=setTimeout(O,P)}),o.isCancellationRequested)return null;let S=Qe(r),N=a.get("inlineCompletion.maxTokens",150),y=a.get("inlineCompletion.temperature",.05),z="";try{if(this.nativeCompletionsAvailable!==!1)try{z=await ge({model:r,prompt:`${S.prefix}${L}${S.suffix}${p}${S.middle}`,max_tokens:N,temperature:y,stop:[...S.stopSequences,`


`]}),this.nativeCompletionsAvailable=!0}catch(se){if(se instanceof x&&se.statusCode===404)this.nativeCompletionsAvailable=!1;else throw se}if(this.nativeCompletionsAvailable===!1&&(z=await me({model:r,messages:[{role:"user",content:`Complete the following ${e.languageId} code. Output ONLY the completion text \u2014 no explanation, no markdown fences.

${S.prefix}${L}${S.suffix}${p}${S.middle}`}],max_tokens:N,temperature:y})),o.isCancellationRequested)return null;let O=Ye(z,S);return O.trim()?new B.InlineCompletionList([new B.InlineCompletionItem(O,new B.Range(t,t))]):null}catch(O){return O instanceof x,null}}dispose(){this.debounceTimer&&clearTimeout(this.debounceTimer)}};var G=M(require("vscode")),oe=class{statusBar;gatewayRunning=!1;currentModel="";constructor(){this.statusBar=G.window.createStatusBarItem(G.StatusBarAlignment.Right,100),this.statusBar.command="sagellm.openChat",this.update(),this.statusBar.show()}setGatewayStatus(e){this.gatewayRunning=e,this.update()}setModel(e){this.currentModel=e,this.update()}setConnecting(){this.statusBar.text="$(sync~spin) SageLLM",this.statusBar.tooltip="Connecting to sagellm-gateway...",this.statusBar.backgroundColor=void 0}setError(e){this.statusBar.text="$(error) SageLLM",this.statusBar.tooltip=`SageLLM: ${e}
Click to open chat`,this.statusBar.backgroundColor=new G.ThemeColor("statusBarItem.errorBackground")}update(){if(!this.gatewayRunning)this.statusBar.text="$(circle-slash) SageLLM",this.statusBar.tooltip="sagellm-gateway not connected \u2014 click to open chat and check status",this.statusBar.backgroundColor=new G.ThemeColor("statusBarItem.warningBackground");else{let e=this.currentModel?` (${this.currentModel})`:"";this.statusBar.text=`$(hubot) SageLLM${e}`,this.statusBar.tooltip=`sagellm-gateway connected${e}
Click to open chat`,this.statusBar.backgroundColor=void 0}}dispose(){this.statusBar.dispose()}};var U=null,k=null,j=null;async function Ke(n){let e=new Z(n);k=new oe,n.subscriptions.push(k);let t=new D(n.extensionUri,e);n.subscriptions.push(g.window.registerWebviewViewProvider(D.viewType,t,{webviewOptions:{retainContextWhenHidden:!0}}));let s=new ee(e),o=g.window.createTreeView("sagellm.modelsView",{treeDataProvider:s,showCollapseAll:!1});n.subscriptions.push(o);let a=new ne(e);n.subscriptions.push(g.languages.registerInlineCompletionItemProvider({pattern:"**"},a)),n.subscriptions.push(g.commands.registerCommand("sagellm.openChat",()=>{let d=g.window.activeTextEditor,u=d?.document.getText(d.selection)??"";_.createOrShow(n.extensionUri,e,u||void 0)}),g.commands.registerCommand("sagellm.selectModel",async()=>{await e.selectModelInteractive(),k?.setModel(e.currentModel),s.refresh()}),g.commands.registerCommand("sagellm.refreshModels",async()=>{await g.window.withProgress({location:g.ProgressLocation.Notification,title:"SageLLM: Fetching models\u2026",cancellable:!1},async()=>{try{await e.refresh(),s.refresh(),g.window.showInformationMessage(`SageLLM: ${e.getModels().length} model(s) loaded`)}catch(d){g.window.showErrorMessage(`SageLLM: ${d instanceof x?d.message:String(d)}`)}})}),g.commands.registerCommand("sagellm.startGateway",()=>q(n,k)),g.commands.registerCommand("sagellm.configureServer",()=>q(n,k)),g.commands.registerCommand("sagellm.stopGateway",()=>Se(k)),g.commands.registerCommand("sagellm.restartGateway",async()=>{for(let c of g.window.terminals)c.name.startsWith("SageLLM")&&c.dispose();let d=g.workspace.getConfiguration("sagellm"),u=d.get("gateway.port",A);try{re.execSync(`fuser -k ${u}/tcp 2>/dev/null; true`,{stdio:"ignore"})}catch{try{re.execSync(`lsof -ti:${u} | xargs kill -9 2>/dev/null; true`,{stdio:"ignore"})}catch{}}await new Promise(c=>setTimeout(c,1500));let p=d.get("preloadModel","").trim(),m=d.get("backend","").trim();p&&m?Ee(k):q(n,k)}),g.commands.registerCommand("sagellm.showInstallGuide",()=>{Xe(n.extensionUri)}),g.commands.registerCommand("sagellm.explainCode",()=>{let d=g.window.activeTextEditor;if(!d)return;let u=d.document.getText(d.selection);if(!u.trim()){g.window.showWarningMessage("SageLLM: Select some code first.");return}let p=d.document.languageId,m=g.workspace.asRelativePath(d.document.uri);_.invokeAction(n.extensionUri,e,`Explain this ${p} code from \`${m}\`:

\`\`\`${p}
${u}
\`\`\``)}),g.commands.registerCommand("sagellm.generateTests",()=>{let d=g.window.activeTextEditor;if(!d)return;let u=d.document.getText(d.selection);if(!u.trim()){g.window.showWarningMessage("SageLLM: Select a function or class first.");return}let p=d.document.languageId;_.invokeAction(n.extensionUri,e,`Write comprehensive unit tests for this ${p} code. Cover edge cases.

\`\`\`${p}
${u}
\`\`\``)}),g.commands.registerCommand("sagellm.fixCode",()=>{let d=g.window.activeTextEditor;if(!d)return;let u=d.document.getText(d.selection);if(!u.trim()){g.window.showWarningMessage("SageLLM: Select the code to fix.");return}let p=d.document.languageId;_.invokeAction(n.extensionUri,e,`Find bugs and fix this ${p} code. Show the corrected version with a brief explanation of each fix.

\`\`\`${p}
${u}
\`\`\``)}),g.commands.registerCommand("sagellm.generateDocstring",()=>{let d=g.window.activeTextEditor;if(!d)return;let u=d.document.getText(d.selection);if(!u.trim()){g.window.showWarningMessage("SageLLM: Select a function or class.");return}let p=d.document.languageId;_.invokeAction(n.extensionUri,e,`Write a docstring/JSDoc comment for this ${p} code. Follow the language's standard documentation style.

\`\`\`${p}
${u}
\`\`\``)}),g.commands.registerCommand("sagellm.checkConnection",async()=>{k?.setConnecting();let d=await C();if(k?.setGatewayStatus(d),d)await e.refresh().catch(()=>{}),s.refresh(),k?.setModel(e.currentModel),g.window.showInformationMessage("SageLLM: Gateway connected \u2713");else{let u=g.workspace.getConfiguration("sagellm"),p=u.get("gateway.host","localhost"),m=u.get("gateway.port",A),c=await g.window.showWarningMessage(`SageLLM: Cannot reach gateway at ${p}:${m}`,"Start Gateway","Installation Guide","Open Settings");c==="Start Gateway"?g.commands.executeCommand("sagellm.startGateway"):c==="Installation Guide"?g.commands.executeCommand("sagellm.showInstallGuide"):c==="Open Settings"&&g.commands.executeCommand("workbench.action.openSettings","@ext:intellistream.sagellm-vscode")}}));let r=g.workspace.getConfiguration("sagellm");if(r.get("autoStartGateway",!0)){let d=r.get("preloadModel","").trim(),u=r.get("backend","").trim();d&&u?C().then(p=>{p||Ee(k)}):C().then(p=>{p||setTimeout(()=>q(n,k),1500)})}j=setInterval(async()=>{let d=await C();k?.setGatewayStatus(d),d&&e.currentModel&&k?.setModel(e.currentModel)},3e4),n.subscriptions.push({dispose:()=>{j&&clearInterval(j)}});async function l(d){let u=await C();if(k?.setGatewayStatus(u),u){let p=!1;try{let m=await e.refresh();if(s.refresh(),m.length>0){let c=e.currentModel||m[0].id,b=m.find(L=>L.id===c);await e.setModel(b?b.id:m[0].id),p=!0}k?.setModel(e.currentModel),e.currentModel&&(_.notifyModelChanged(e.currentModel),D.notifyModelChanged(e.currentModel))}catch{}return p}else return d&&await g.window.showWarningMessage("SageLLM: Gateway not reachable. Configure and start now?","Configure Server","Dismiss")==="Configure Server"&&g.commands.executeCommand("sagellm.configureServer"),!1}let i=0,f=10;async function h(){if(i++,i>f)return;let d=Math.min(2e3*i,3e4);setTimeout(async()=>{let u=i>=3;await l(u)||h()},d)}h()}function Je(){Se(k),j&&clearInterval(j)}function Ee(n){let e=g.workspace.getConfiguration("sagellm"),t=e.get("gatewayStartCommand","sagellm serve"),s=e.get("gateway.port",A),o=e.get("preloadModel","").trim(),a=e.get("backend","").trim();if(U&&!U.killed){g.window.showInformationMessage("SageLLM: Gateway is already running");return}let r=t;a&&(r+=` --backend ${a}`),o&&(r+=` --model ${o}`),r+=` --port ${s}`;let l=g.window.createTerminal({name:"SageLLM Gateway",isTransient:!1,env:{SAGELLM_PREFLIGHT_CANARY:"0"}});l.sendText(r),l.show(!1),n?.setConnecting(),g.window.showInformationMessage(`SageLLM: Starting gateway with "${r}"\u2026`);let i=0,f=100,h=setInterval(async()=>{if(i++,await C())clearInterval(h),n?.setGatewayStatus(!0),g.window.showInformationMessage("SageLLM: Gateway is ready \u2713");else if(i>=f)clearInterval(h),n?.setError("Gateway start timed out"),g.window.showWarningMessage("SageLLM: Gateway did not respond within 5 minutes. Check the terminal for errors.");else if(i%20===0){let u=Math.round(i*3/60);n?.setConnecting(),g.window.setStatusBarMessage(`SageLLM: Loading model\u2026 (${u} min elapsed)`,5e3)}},3e3)}function Se(n){U&&!U.killed&&(U.kill("SIGTERM"),U=null),n?.setGatewayStatus(!1)}function Xe(n){let e=g.window.createWebviewPanel("sagellm.installGuide","SageLLM: Installation Guide",g.ViewColumn.One,{enableScripts:!1});e.webview.html=Ze()}function Ze(){return`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SageLLM Installation Guide</title>
  <style>
    body {
      font-family: var(--vscode-font-family); font-size: var(--vscode-font-size);
      color: var(--vscode-foreground); background: var(--vscode-editor-background);
      max-width: 720px; margin: 0 auto; padding: 32px 24px; line-height: 1.6;
    }
    h1 { font-size: 24px; margin-bottom: 8px; }
    h2 { font-size: 16px; margin: 24px 0 8px; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 4px; }
    code, pre {
      font-family: var(--vscode-editor-font-family);
      background: var(--vscode-textCodeBlock-background);
      border-radius: 4px;
    }
    code { padding: 2px 6px; font-size: 0.9em; }
    pre { padding: 12px 16px; overflow-x: auto; margin: 8px 0; }
    pre code { background: none; padding: 0; }
    .step {
      display: flex; gap: 12px; margin-bottom: 16px;
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px; padding: 14px 16px;
    }
    .step-num {
      width: 28px; height: 28px; border-radius: 50%;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      display: flex; align-items: center; justify-content: center;
      font-weight: bold; flex-shrink: 0; font-size: 13px;
    }
    .note {
      background: var(--vscode-inputValidation-infoBackground);
      border: 1px solid var(--vscode-inputValidation-infoBorder);
      border-radius: 6px; padding: 10px 14px; margin: 12px 0;
      font-size: 12px;
    }
    a { color: var(--vscode-textLink-foreground); }
  </style>
</head>
<body>
  <h1>\u{1F680} SageLLM Setup Guide</h1>
  <p>Follow these steps to install SageLLM and connect this extension to it.</p>

  <h2>Prerequisites</h2>
  <div class="step">
    <div class="step-num">1</div>
    <div>
      <strong>Python 3.10+</strong> and a conda/virtualenv environment.<br/>
      <code>python --version</code>
    </div>
  </div>

  <h2>Install SageLLM</h2>
  <div class="step">
    <div class="step-num">2</div>
    <div>
      Install the SageLLM meta-package from PyPI:<br/>
      <pre><code>pip install isagellm</code></pre>
      Or install from source:<br/>
      <pre><code>git clone https://github.com/intellistream/sagellm
cd sagellm
pip install -e .[dev]</code></pre>
    </div>
  </div>

  <h2>Start the Server</h2>
  <div class="step">
    <div class="step-num">3</div>
    <div>
      Start the full inference stack (gateway + engine, OpenAI-compatible API):
      <pre><code>sagellm serve</code></pre>
      With a specific model and backend:
      <pre><code>sagellm serve --backend cpu --model Qwen/Qwen2.5-1.5B-Instruct</code></pre>
      On GPU (CUDA):
      <pre><code>sagellm serve --backend cuda --model Qwen/Qwen2.5-7B-Instruct</code></pre>
      <div class="note">\u{1F4A1} Tip: Add <code>SAGELLM_PREFLIGHT_CANARY=0</code> to skip the pre-validation step for faster first startup.</div>
    </div>
  </div>

  <h2>Configure the Extension</h2>
  <div class="step">
    <div class="step-num">4</div>
    <div>
      Open VS Code Settings (<code>Ctrl+,</code>) and search for <strong>SageLLM</strong>:
      <ul style="margin: 8px 0 0 16px;">
        <li><code>sagellm.gateway.host</code> \u2014 default: <code>localhost</code></li>
        <li><code>sagellm.gateway.port</code> \u2014 default: <code>8901</code> (<code>sagellm serve</code> default)</li>
        <li><code>sagellm.gateway.apiKey</code> \u2014 if your gateway requires auth</li>
      </ul>
    </div>
  </div>

  <div class="step">
    <div class="step-num">5</div>
    <div>
      Click the <strong>\u26A1 SageLLM</strong> item in the status bar, or run the command<br/>
      <strong>SageLLM: Check Connection</strong> to verify everything is working.
    </div>
  </div>

  <div class="note">
    \u2139\uFE0F The extension auto-starts <code>sagellm serve</code> when you enable
    <code>sagellm.autoStartGateway</code> in settings. Model loading may take
    several minutes \u2014 the extension polls for up to 5 minutes.
  </div>

  <h2>Resources</h2>
  <ul>
    <li><a href="https://github.com/intellistream/sagellm">SageLLM GitHub</a></li>
    <li><a href="https://github.com/intellistream/sagellm-vscode/issues">Report an issue</a></li>
  </ul>
</body>
</html>`}0&&(module.exports={activate,deactivate});
