"use strict";var pe=Object.create;var U=Object.defineProperty;var ue=Object.getOwnPropertyDescriptor;var me=Object.getOwnPropertyNames;var he=Object.getPrototypeOf,ve=Object.prototype.hasOwnProperty;var fe=(n,e)=>{for(var t in e)U(n,t,{get:e[t],enumerable:!0})},te=(n,e,t,o)=>{if(e&&typeof e=="object"||typeof e=="function")for(let s of me(e))!ve.call(n,s)&&s!==t&&U(n,s,{get:()=>e[s],enumerable:!(o=ue(e,s))||o.enumerable});return n};var S=(n,e,t)=>(t=n!=null?pe(he(n)):{},te(e||!n||!n.__esModule?U(t,"default",{value:n,enumerable:!0}):t,n)),we=n=>te(U({},"__esModule",{value:!0}),n);var Re={};fe(Re,{activate:()=>Pe,deactivate:()=>Ae});module.exports=we(Re);var c=S(require("vscode"));var x=S(require("vscode"));var ne=S(require("https")),oe=S(require("http")),se=S(require("vscode"));var be={STUDIO_FRONTEND:5173,STUDIO_BACKEND:8765,SAGELLM_GATEWAY:8889,EDGE_DEFAULT:8899,SAGELLM_SERVE_PORT:8901,SAGELLM_ENGINE_PORT:8902,SAGELLM_SERVE_PORT_2:8903,SAGELLM_ENGINE_PORT_2:8904,EMBEDDING_DEFAULT:8090,EMBEDDING_SECONDARY:8091,BENCHMARK_EMBEDDING:8950,BENCHMARK_API:8951},P=be.SAGELLM_SERVE_PORT;var y=class extends Error{constructor(t,o){super(t);this.statusCode=o;this.name="GatewayConnectionError"}};function z(){let n=se.workspace.getConfiguration("sagellm"),e=n.get("gateway.host","localhost"),t=n.get("gateway.port",P),o=n.get("gateway.apiKey","");return{baseUrl:`${n.get("gateway.tls",!1)?"https":"http"}://${e}:${t}`,apiKey:o}}function O(n,e,t,o){return new Promise((s,a)=>{let d=new URL(e),l=d.protocol==="https:"?ne:oe,w={hostname:d.hostname,port:d.port,path:d.pathname+d.search,method:n,headers:{"Content-Type":"application/json",Accept:"application/json",...t?{Authorization:`Bearer ${t}`}:{},...o?{"Content-Length":Buffer.byteLength(o)}:{}}},h=l.request(w,r=>{let g="";r.on("data",p=>g+=p),r.on("end",()=>s({statusCode:r.statusCode??0,data:g}))});h.on("error",r=>a(new y(`Network error: ${r.message}`))),h.setTimeout(3e4,()=>{h.destroy(),a(new y("Request timed out after 30s"))}),o&&h.write(o),h.end()})}async function H(){let{baseUrl:n,apiKey:e}=z();try{let{statusCode:t,data:o}=await O("GET",`${n}/v1/models`,e);if(t!==200)throw new y(`Gateway returned HTTP ${t}`,t);return JSON.parse(o).data??[]}catch(t){throw t instanceof y?t:new y(`Failed to reach sagellm-gateway at ${n}: ${String(t)}`)}}async function M(){let{baseUrl:n,apiKey:e}=z();try{let{statusCode:t}=await O("GET",`${n}/v1/models`,e);return t===200}catch{return!1}}async function Z(n,e,t){let{baseUrl:o,apiKey:s}=z(),a=JSON.stringify({...n,stream:!0});return new Promise((d,m)=>{if(t?.aborted){m(new Error("Aborted"));return}let l=new URL(`${o}/v1/chat/completions`),h=l.protocol==="https:"?ne:oe,r={hostname:l.hostname,port:l.port,path:l.pathname,method:"POST",headers:{"Content-Type":"application/json",Accept:"text/event-stream",...s?{Authorization:`Bearer ${s}`}:{},"Content-Length":Buffer.byteLength(a)}},g="",p="",u=h.request(r,i=>{if(i.statusCode!==200){let b="";i.on("data",L=>b+=L),i.on("end",()=>m(new y(`Gateway returned HTTP ${i.statusCode}: ${b}`,i.statusCode)));return}i.on("data",b=>{p+=b.toString();let L=p.split(`
`);p=L.pop()??"";for(let I of L){let C=I.trim();if(!(!C||C==="data: [DONE]")&&C.startsWith("data: "))try{let f=JSON.parse(C.slice(6)).choices?.[0]?.delta?.content??"";f&&(g+=f,e(f))}catch{}}}),i.on("end",()=>d(g)),i.on("error",b=>m(new y(b.message)))});u.on("error",i=>m(new y(`Network error: ${i.message}`))),u.setTimeout(12e4,()=>{u.destroy(),m(new y("Chat request timed out after 120s"))}),t&&t.addEventListener("abort",()=>{u.destroy(),d(g)}),u.write(a),u.end()})}async function ae(n){let{baseUrl:e,apiKey:t}=z(),o=JSON.stringify({...n,stream:!1}),{statusCode:s,data:a}=await O("POST",`${e}/v1/completions`,t,o);if(s===404)throw new y("Endpoint /v1/completions not available",404);if(s!==200)throw new y(`Gateway returned HTTP ${s}: ${a}`,s);return JSON.parse(a).choices?.[0]?.text??""}async function ie(n){let{baseUrl:e,apiKey:t}=z(),o=JSON.stringify({...n,stream:!1}),{statusCode:s,data:a}=await O("POST",`${e}/v1/chat/completions`,t,o);if(s!==200)throw new y(`Gateway returned HTTP ${s}: ${a}`,s);return JSON.parse(a).choices?.[0]?.message?.content??""}var Q=class{constructor(e){this.context=e;this.selectedModel=x.workspace.getConfiguration("sagellm").get("model","")||e.globalState.get("sagellm.selectedModel","")}models=[];selectedModel="";_onDidChangeModels=new x.EventEmitter;onDidChangeModels=this._onDidChangeModels.event;get currentModel(){return this.selectedModel}getModels(){return this.models}async refresh(){try{return this.models=await H(),this._onDidChangeModels.fire(this.models),this.models}catch(e){throw e instanceof y?e:new Error(String(e))}}async selectModelInteractive(){let e=this.models;if(e.length===0)try{e=await this.refresh()}catch{x.window.showErrorMessage("Cannot reach sagellm-gateway. Is it running? Run 'SageLLM: Start Gateway' or check your settings.");return}if(e.length===0){x.window.showWarningMessage("No models available on the gateway. Please load a model first.");return}let t=e.map(s=>({label:s.id,description:s.owned_by,detail:`Object: ${s.object}`})),o=await x.window.showQuickPick(t,{placeHolder:"Select a SageLLM model",title:"SageLLM: Available Models"});if(o)return await this.setModel(o.label),o.label}async setModel(e){this.selectedModel=e,await this.context.globalState.update("sagellm.selectedModel",e),x.workspace.getConfiguration("sagellm").update("model",e,x.ConfigurationTarget.Global)}async ensureModel(){return this.selectedModel?this.selectedModel:this.selectModelInteractive()}dispose(){this._onDidChangeModels.dispose()}},F=class{constructor(e){this.modelManager=e;e.onDidChangeModels(()=>this._onDidChangeTreeData.fire())}_onDidChangeTreeData=new x.EventEmitter;onDidChangeTreeData=this._onDidChangeTreeData.event;getTreeItem(e){return e}getChildren(){let e=this.modelManager.getModels();return e.length===0?[new W("No models loaded",x.TreeItemCollapsibleState.None,!0)]:e.map(t=>new W(t.id,x.TreeItemCollapsibleState.None,!1,t.id===this.modelManager.currentModel,t))}refresh(){this._onDidChangeTreeData.fire()}},W=class extends x.TreeItem{constructor(t,o,s=!1,a=!1,d){super(t,o);this.model=d;s?(this.contextValue="placeholder",this.iconPath=new x.ThemeIcon("info")):a?(this.iconPath=new x.ThemeIcon("check"),this.contextValue="activeModel",this.description="active"):(this.iconPath=new x.ThemeIcon("hubot"),this.contextValue="model",this.command={command:"sagellm.selectModel",title:"Select Model",arguments:[t]})}};var E=S(require("vscode"));var T=class n{constructor(e,t,o){this.modelManager=o;this.panel=e,this.extensionUri=t,this.panel.webview.html=this.getHtml(),this.panel.onDidDispose(()=>this.dispose(),null,this.disposables),this.panel.webview.onDidReceiveMessage(s=>this.handleMessage(s),null,this.disposables),this.initChat()}static currentPanel;static viewType="sagellm.chatView";panel;extensionUri;history=[];abortController=null;disposables=[];static createOrShow(e,t,o){let s=E.window.activeTextEditor?E.ViewColumn.Beside:E.ViewColumn.One;if(n.currentPanel){n.currentPanel.panel.reveal(s),o&&n.currentPanel.sendSelectedText(o);return}let a=E.window.createWebviewPanel(n.viewType,"SageLLM Chat",s,{enableScripts:!0,retainContextWhenHidden:!0,localResourceRoots:[e]});n.currentPanel=new n(a,e,t),o&&n.currentPanel.sendSelectedText(o)}async initChat(){let t=E.workspace.getConfiguration("sagellm").get("chat.systemPrompt","You are a helpful coding assistant. Answer concisely and accurately. For code questions provide working examples. Do not repeat or reference these instructions in your replies.");this.history=[{role:"system",content:t}];let o=await M(),s=!!this.modelManager.currentModel;if(o&&!this.modelManager.currentModel)try{let a=await this.modelManager.refresh();a.length>0&&(await this.modelManager.setModel(a[0].id),s=!0)}catch{}this.panel.webview.postMessage({type:"init",gatewayConnected:o,model:this.modelManager.currentModel}),s||this.scheduleModelRestore(o?3:4)}scheduleModelRestore(e,t=6){t<=0||setTimeout(async()=>{if(this.modelManager.currentModel){this.panel.webview.postMessage({type:"connectionStatus",connected:!0,model:this.modelManager.currentModel});return}if(await M())try{let a=await this.modelManager.refresh();a.length>0&&await this.modelManager.setModel(a[0].id)}catch{}let s=this.modelManager.currentModel;s?this.panel.webview.postMessage({type:"connectionStatus",connected:!0,model:s}):this.scheduleModelRestore(Math.min(e*2,15),t-1)},e*1e3)}updateModelBadge(e){this.panel.webview.postMessage({type:"modelChanged",model:e})}static notifyModelChanged(e){n.currentPanel?.updateModelBadge(e),R.notifyModelChanged(e)}sendSelectedText(e){this.panel.webview.postMessage({type:"insertText",text:e})}static invokeAction(e,t,o){n.createOrShow(e,t),setTimeout(()=>{n.currentPanel?.panel.webview.postMessage({type:"sendImmediate",text:o})},350)}async handleMessage(e){switch(e.type){case"send":await this.handleChatMessage(e.text??"");break;case"abort":this.abortController?.abort();break;case"clear":await this.initChat(),this.panel.webview.postMessage({type:"cleared"});break;case"selectModel":await this.modelManager.selectModelInteractive(),this.panel.webview.postMessage({type:"modelChanged",model:this.modelManager.currentModel});break;case"checkConnection":{let t=await M();this.panel.webview.postMessage({type:"connectionStatus",connected:t,model:this.modelManager.currentModel});break}case"showInstallGuide":E.commands.executeCommand("sagellm.showInstallGuide");break}}async handleChatMessage(e){if(!e.trim())return;let t=this.modelManager.currentModel;if(!t&&(t=await this.modelManager.selectModelInteractive()??"",!t)){this.panel.webview.postMessage({type:"error",text:"No model selected. Please select a model first."});return}let o=E.workspace.getConfiguration("sagellm"),s=o.get("chat.maxTokens",2048),a=o.get("chat.temperature",.7);this.history.push({role:"user",content:e}),this.panel.webview.postMessage({type:"userMessage",text:e}),this.panel.webview.postMessage({type:"assistantStart"}),this.abortController=new AbortController;try{let d=await Z({model:t,messages:this.history,max_tokens:s,temperature:a},m=>{this.panel.webview.postMessage({type:"assistantDelta",text:m})},this.abortController.signal);this.history.push({role:"assistant",content:d}),this.panel.webview.postMessage({type:"assistantEnd"})}catch(d){let m=d instanceof Error?d.message:"Unknown error occurred";this.panel.webview.postMessage({type:"error",text:m}),this.history.pop()}finally{this.abortController=null}}getHtml(){let e=re();return`<!DOCTYPE html>
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
    <div id="hint">Enter \u21B5 to send \xB7 Shift+Enter for new line \xB7 /clear to reset</div>
  </div>

  <script nonce="${e}">
    const vscode = acquireVsCodeApi();
    const messagesEl = document.getElementById('messages');
    const inputEl = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    const abortBtn = document.getElementById('abort-btn');
    const clearBtn = document.getElementById('clear-btn');
    const checkBtn = document.getElementById('check-btn');
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
</html>`}dispose(){for(this.abortController?.abort(),n.currentPanel=void 0,this.panel.dispose();this.disposables.length;)this.disposables.pop()?.dispose()}};function re(){let n="",e="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";for(let t=0;t<32;t++)n+=e.charAt(Math.floor(Math.random()*e.length));return n}var R=class n{constructor(e,t){this.extensionUri=e;this.modelManager=t;n._instance=this}static viewType="sagellm.chatView";static _instance;_view;history=[];abortController=null;static notifyModelChanged(e){n._instance?._view?.webview.postMessage({type:"modelChanged",model:e})}resolveWebviewView(e,t,o){this._view=e,e.webview.options={enableScripts:!0,localResourceRoots:[this.extensionUri]},e.webview.html=this._getHtml(),e.webview.onDidReceiveMessage(s=>this._handleMessage(s)),this._initChat()}async _initChat(){if(!this._view)return;let t=E.workspace.getConfiguration("sagellm").get("chat.systemPrompt","You are a helpful coding assistant. Answer concisely and accurately. For code questions provide working examples. Do not repeat or reference these instructions in your replies.");this.history=[{role:"system",content:t}];let o=await M(),s=!!this.modelManager.currentModel;if(o&&!this.modelManager.currentModel)try{let a=await this.modelManager.refresh();a.length>0&&(await this.modelManager.setModel(a[0].id),s=!0)}catch{}this._view.webview.postMessage({type:"init",gatewayConnected:o,model:this.modelManager.currentModel}),s||this._scheduleModelRestore(o?3:4)}_scheduleModelRestore(e,t=6){t<=0||!this._view||setTimeout(async()=>{if(!this._view)return;if(this.modelManager.currentModel){this._view.webview.postMessage({type:"connectionStatus",connected:!0,model:this.modelManager.currentModel});return}if(await M())try{let a=await this.modelManager.refresh();a.length>0&&await this.modelManager.setModel(a[0].id)}catch{}let s=this.modelManager.currentModel;s?this._view.webview.postMessage({type:"connectionStatus",connected:!0,model:s}):this._scheduleModelRestore(Math.min(e*2,15),t-1)},e*1e3)}updateModelBadge(e){this._view?.webview.postMessage({type:"modelChanged",model:e})}async _handleMessage(e){switch(e.type){case"send":await this._handleChatMessage(e.text??"");break;case"abort":this.abortController?.abort();break;case"clear":await this._initChat(),this._view?.webview.postMessage({type:"cleared"});break;case"selectModel":await this.modelManager.selectModelInteractive(),this._view?.webview.postMessage({type:"modelChanged",model:this.modelManager.currentModel});break;case"checkConnection":{let t=await M();this._view?.webview.postMessage({type:"connectionStatus",connected:t,model:this.modelManager.currentModel});break}case"showInstallGuide":E.commands.executeCommand("sagellm.showInstallGuide");break}}async _handleChatMessage(e){if(!e.trim()||!this._view)return;let t=this.modelManager.currentModel;if(!t&&(t=await this.modelManager.selectModelInteractive()??"",!t)){this._view.webview.postMessage({type:"error",text:"No model selected. Please select a model first."});return}let o=E.workspace.getConfiguration("sagellm"),s=o.get("chat.maxTokens",2048),a=o.get("chat.temperature",.7);this.history.push({role:"user",content:e}),this._view.webview.postMessage({type:"userMessage",text:e}),this._view.webview.postMessage({type:"assistantStart"}),this.abortController=new AbortController;try{let d=await Z({model:t,messages:this.history,max_tokens:s,temperature:a},m=>{this._view?.webview.postMessage({type:"assistantDelta",text:m})},this.abortController.signal);this.history.push({role:"assistant",content:d}),this._view.webview.postMessage({type:"assistantEnd"})}catch(d){let m=d instanceof Error?d.message:"Unknown error occurred";this._view.webview.postMessage({type:"error",text:m}),this.history.pop()}finally{this.abortController=null}}_getHtml(){let e=re();return`<!DOCTYPE html>
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
      <a id="install-link">Installation guide</a> \xB7
      <a id="retry-link">Retry</a>
    </div>
    <div id="input-row">
      <textarea id="user-input" placeholder="Ask SageLLM anything\u2026 (Enter to send)" rows="1" autofocus></textarea>
      <button id="send-btn">Send</button>
      <button id="abort-btn">Stop</button>
    </div>
    <div id="hint">Enter \u21B5 to send \xB7 Shift+Enter for new line</div>
  </div>
  <script nonce="${e}">
    const vscode = acquireVsCodeApi();
    const messagesEl = document.getElementById('messages');
    const inputEl = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    const abortBtn = document.getElementById('abort-btn');
    const clearBtn = document.getElementById('clear-btn');
    const checkBtn = document.getElementById('check-btn');
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
        case 'connectionStatus': updateConnectionStatus(msg.connected); updateModel(msg.model); break;
        case 'modelChanged': updateModel(msg.model); break;
      }
    });
  </script>
</body>
</html>`}};var B=S(require("vscode"));function ye(n){let e=n.toLowerCase();return e.includes("qwen")?{prefix:"<|fim_prefix|>",suffix:"<|fim_suffix|>",middle:"<|fim_middle|>",stopSequences:["<|endoftext|>","<|fim_pad|>","<|fim_suffix|>","<|im_end|>"]}:e.includes("deepseek")?{prefix:"<\uFF5Cfim\u2581begin\uFF5C>",suffix:"<\uFF5Cfim\u2581hole\uFF5C>",middle:"<\uFF5Cfim\u2581end\uFF5C>",stopSequences:["<\uFF5Cfim\u2581begin\uFF5C>","<\uFF5Cfim\u2581hole\uFF5C>","<\uFF5Cfim\u2581end\uFF5C>","<|eos_token|>"]}:e.includes("codellama")||e.includes("mistral")?{prefix:"<PRE>",suffix:"<SUF>",middle:"<MID>",stopSequences:["<EOT>"]}:e.includes("starcoder")||e.includes("starchat")?{prefix:"<fim_prefix>",suffix:"<fim_suffix>",middle:"<fim_middle>",stopSequences:["<|endoftext|>","<fim_prefix>"]}:{prefix:"<|fim_prefix|>",suffix:"<|fim_suffix|>",middle:"<|fim_middle|>",stopSequences:["<|endoftext|>"]}}function xe(n,e){if(e<=0)return"";let t=B.workspace.textDocuments.filter(a=>a.uri.toString()!==n.toString()&&!a.isUntitled&&a.uri.scheme==="file"&&a.getText().length>10).slice(0,4);if(t.length===0)return"";let o=[],s=e;for(let a of t){if(s<=0)break;let d=B.workspace.asRelativePath(a.uri),m=a.getText().slice(0,Math.min(s,1200)),l=`// [${d}]
${m}`;o.push(l),s-=l.length}return`// \u2500\u2500\u2500 Related open files \u2500\u2500\u2500
${o.join(`

`)}
// \u2500\u2500\u2500 Current file \u2500\u2500\u2500
`}function Me(n,e){let t=n.lineAt(e.line).text,o=t.slice(0,e.character);if(o.trimStart().length<3)return!0;let a=t[e.character];if(a!==void 0&&/[\w]/.test(a)||/^\s*(\/\/|#|--|\/\*)/.test(t))return!0;let d=(o.match(/(?<!\\)'/g)??[]).length,m=(o.match(/(?<!\\)"/g)??[]).length;return d%2!==0||m%2!==0}function ke(n,e){let t=n;for(let s of e.stopSequences){let a=t.indexOf(s);a!==-1&&(t=t.slice(0,a))}for(let s of[e.prefix,e.suffix,e.middle]){let a=t.indexOf(s);a!==-1&&(t=t.slice(0,a))}let o=t.split(`
`);for(;o.length>0&&o[o.length-1].trim()==="";)o.pop();return o.join(`
`)}var q=class{constructor(e){this.modelManager=e}debounceTimer=null;nativeCompletionsAvailable=null;async provideInlineCompletionItems(e,t,o,s){let a=B.workspace.getConfiguration("sagellm");if(!a.get("inlineCompletion.enabled",!0))return null;let d=this.modelManager.currentModel;if(!d||Me(e,t))return null;let m=e.getText(),l=e.offsetAt(t),w=a.get("inlineCompletion.contextLines",80),h=Math.max(0,t.line-w),r=e.offsetAt(new B.Position(h,0)),g=m.slice(r,l),p=m.slice(l,Math.min(l+400,m.length)),u=a.get("inlineCompletion.tabContextChars",2e3),L=(a.get("inlineCompletion.useTabContext",!0)?xe(e.uri,u):"")+g,I=a.get("inlineCompletion.triggerDelay",350);if(await new Promise(G=>{this.debounceTimer&&clearTimeout(this.debounceTimer),this.debounceTimer=setTimeout(G,I)}),s.isCancellationRequested)return null;let C=ye(d),$=a.get("inlineCompletion.maxTokens",150),f=a.get("inlineCompletion.temperature",.05),_="";try{if(this.nativeCompletionsAvailable!==!1)try{_=await ae({model:d,prompt:`${C.prefix}${L}${C.suffix}${p}${C.middle}`,max_tokens:$,temperature:f,stop:[...C.stopSequences,`


`]}),this.nativeCompletionsAvailable=!0}catch(X){if(X instanceof y&&X.statusCode===404)this.nativeCompletionsAvailable=!1;else throw X}if(this.nativeCompletionsAvailable===!1&&(_=await ie({model:d,messages:[{role:"user",content:`Complete the following ${e.languageId} code. Output ONLY the completion text \u2014 no explanation, no markdown fences.

${C.prefix}${L}${C.suffix}${p}${C.middle}`}],max_tokens:$,temperature:f})),s.isCancellationRequested)return null;let G=ke(_,C);return G.trim()?new B.InlineCompletionList([new B.InlineCompletionItem(G,new B.Range(t,t))]):null}catch(G){return G instanceof y,null}}dispose(){this.debounceTimer&&clearTimeout(this.debounceTimer)}};var A=S(require("vscode")),V=class{statusBar;gatewayRunning=!1;currentModel="";constructor(){this.statusBar=A.window.createStatusBarItem(A.StatusBarAlignment.Right,100),this.statusBar.command="sagellm.openChat",this.update(),this.statusBar.show()}setGatewayStatus(e){this.gatewayRunning=e,this.update()}setModel(e){this.currentModel=e,this.update()}setConnecting(){this.statusBar.text="$(sync~spin) SageLLM",this.statusBar.tooltip="Connecting to sagellm-gateway...",this.statusBar.backgroundColor=void 0}setError(e){this.statusBar.text="$(error) SageLLM",this.statusBar.tooltip=`SageLLM: ${e}
Click to open chat`,this.statusBar.backgroundColor=new A.ThemeColor("statusBarItem.errorBackground")}update(){if(!this.gatewayRunning)this.statusBar.text="$(circle-slash) SageLLM",this.statusBar.tooltip="sagellm-gateway not connected \u2014 click to open chat and check status",this.statusBar.backgroundColor=new A.ThemeColor("statusBarItem.warningBackground");else{let e=this.currentModel?` (${this.currentModel})`:"";this.statusBar.text=`$(hubot) SageLLM${e}`,this.statusBar.tooltip=`sagellm-gateway connected${e}
Click to open chat`,this.statusBar.backgroundColor=void 0}}dispose(){this.statusBar.dispose()}};var v=S(require("vscode")),K=S(require("child_process")),j=S(require("fs")),ee=S(require("path")),ce=S(require("os"));var Y=[{id:"Qwen/Qwen2.5-0.5B-Instruct",size:"0.5B",vram:"~1 GB",tags:["chat","cpu-ok","fast"],desc:"Tiny Qwen chat, runs on CPU"},{id:"Qwen/Qwen2.5-Coder-0.5B-Instruct",size:"0.5B",vram:"~1 GB",tags:["code","cpu-ok","fast"],desc:"Tiny code assistant"},{id:"TinyLlama/TinyLlama-1.1B-Chat-v1.0",size:"1.1B",vram:"~2 GB",tags:["chat","cpu-ok"],desc:"Lightweight general chat"},{id:"Qwen/Qwen2.5-1.5B-Instruct",size:"1.5B",vram:"~3 GB",tags:["chat","fast"],desc:"Fast Qwen chat"},{id:"Qwen/Qwen2.5-Coder-1.5B-Instruct",size:"1.5B",vram:"~3 GB",tags:["code","fast"],desc:"Fast code assistant"},{id:"deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B",size:"1.5B",vram:"~3 GB",tags:["chat","reasoning"],desc:"DeepSeek-R1 distilled, strong reasoning"},{id:"Qwen/Qwen2.5-3B-Instruct",size:"3B",vram:"~6 GB",tags:["chat"],desc:"Balanced Qwen chat"},{id:"Qwen/Qwen2.5-Coder-3B-Instruct",size:"3B",vram:"~6 GB",tags:["code"],desc:"Balanced code assistant"},{id:"Qwen/Qwen2.5-7B-Instruct",size:"7B",vram:"~14 GB",tags:["chat","powerful"],desc:"Powerful Qwen chat (needs GPU)"},{id:"Qwen/Qwen2.5-Coder-7B-Instruct",size:"7B",vram:"~14 GB",tags:["code","powerful"],desc:"Powerful code assistant (needs GPU)"},{id:"deepseek-ai/DeepSeek-R1-Distill-Qwen-7B",size:"7B",vram:"~14 GB",tags:["chat","reasoning","powerful"],desc:"DeepSeek-R1 distilled 7B"}];function le(){return ee.join(ce.homedir(),".cache","huggingface","hub")}function Ce(n){return"models--"+n.replace(/\//g,"--")}function de(n){let e=ee.join(le(),Ce(n));return j.existsSync(e)}function Ee(){let n=new Set;try{for(let e of j.readdirSync(le()))e.startsWith("models--")&&n.add(e.slice(8).replace(/--/g,"/"))}catch{}return n}async function Se(n){return v.window.withProgress({location:v.ProgressLocation.Notification,title:`SageLLM: Downloading ${n}`,cancellable:!0},async(e,t)=>new Promise(o=>{let s=K.spawn("huggingface-cli",["download",n,"--resume-download"],{env:{...process.env}}),a=0,d=l=>{let w=l.match(/(\d+)%\|/);if(w){let h=parseInt(w[1],10),r=h-a;if(r>0){a=h;let g=l.match(/[\d.]+\s*[MG]B\/s/)?.[0]??"",p=l.match(/<([\d:]+),/)?.[1]??"";e.report({increment:r,message:`${h}%${g?"  "+g:""}${p?"  ETA "+p:""}`})}}else if(l.includes("Downloading")){let h=l.match(/Downloading (.+?):/)?.[1];h&&e.report({message:h})}},m="";s.stderr.on("data",l=>{let w=l.toString();m+=w;for(let h of w.split(/\r?\n/))d(h)}),s.stdout.on("data",l=>{for(let w of l.toString().split(/\r?\n/))d(w)}),s.on("close",l=>{l===0?(e.report({increment:100-a,message:"\u5B8C\u6210 \u2713"}),o(!0)):(t.isCancellationRequested||v.window.showErrorMessage(`SageLLM: \u4E0B\u8F7D\u5931\u8D25 (exit ${l}).
${m.slice(-300)}`),o(!1))}),s.on("error",l=>{v.window.showErrorMessage(`SageLLM: \u65E0\u6CD5\u8FD0\u884C huggingface-cli: ${l.message}`),o(!1)}),t.onCancellationRequested(()=>{s.kill("SIGTERM"),o(!1)})}))}function Le(n){let e=[{id:"cpu",label:"$(circuit-board) CPU",detected:!0,description:"Always available"}],t=/CUDA.*✅|✅.*CUDA|✅.*\d+\s*device/i.test(n),o=/Ascend.*✅|✅.*Ascend|✅.*torch_npu/i.test(n),s=n.match(/CUDA[^\n]*✅[^\n]*?-\s*(.+)|✅\s*\d+\s*device[^-]*-\s*(.+)/i),a=s?(s[1]||s[2]||"").trim().split(`
`)[0]:"";return t&&e.push({id:"cuda",label:"$(zap) CUDA (GPU)",detected:!0,description:a||"NVIDIA GPU detected"}),o&&e.push({id:"ascend",label:"$(hubot) Ascend (\u6607\u817E NPU)",detected:!0,description:"Ascend NPU detected"}),e}async function Be(){return new Promise(n=>{K.exec("sagellm info",{timeout:15e3},(e,t)=>{try{n(Le(t??""))}catch{n([{id:"cpu",label:"$(circuit-board) CPU",detected:!0,description:"Always available"}])}})})}async function Te(){try{return(await H()).map(e=>e.id)}catch{return[]}}async function Ie(n,e){let t=v.QuickPickItemKind.Separator,[o,s]=await Promise.all([Te(),Promise.resolve(Ee())]),a=new Set,d=[],m=i=>{let b=i.detail??i.label;a.has(b)||(a.add(b),d.push(i))};if(e){let i=s.has(e);m({label:`$(star-full) ${e}`,description:i?"\u2705 last used":"\u2601\uFE0F last used (not cached)",detail:e})}if(o.length){d.push({label:"Running on gateway",kind:t});for(let i of o)m({label:`$(server) ${i}`,description:"\u2705 serving now",detail:i})}let l=Y.filter(i=>s.has(i.id)),w=[...s].filter(i=>!Y.some(b=>b.id===i)),h=n.filter(i=>s.has(i)),r=[],g=(i,b)=>{a.has(i)||(a.add(i),r.push({label:`$(database) ${i}`,description:`\u2705 ${b}`,detail:i}))};l.forEach(i=>g(i.id,`${i.size} \xB7 ${i.vram} \xB7 ${i.desc}`)),h.forEach(i=>g(i,"recent")),w.forEach(i=>g(i,"local cache")),r.length&&(d.push({label:"Downloaded",kind:t}),d.push(...r));let p=[];for(let i of Y){if(a.has(i.id))continue;a.add(i.id);let b=i.tags.includes("cpu-ok")?"runs on CPU \xB7 ":"";p.push({label:`$(cloud-download) ${i.id}`,description:`\u2601\uFE0F ${i.size} \xB7 ${i.vram}  \u2014  ${b}${i.desc}`,detail:i.id})}p.length&&(d.push({label:"Recommended  (will auto-download)",kind:t}),d.push(...p));let u=n.filter(i=>!a.has(i));if(u.length){d.push({label:"Recent",kind:t});for(let i of u)a.add(i),d.push({label:`$(history) ${i}`,description:"recent",detail:i})}return d.push({label:"",kind:t}),d.push({label:"$(edit) Enter model path / HuggingFace ID\u2026",description:"",detail:"__custom__"}),d}async function J(n,e){let t=v.workspace.getConfiguration("sagellm"),o=t.get("gateway.port",P);e?.setConnecting();let a=(await Be()).map(f=>({label:f.label,description:f.detected?`\u2705 ${f.description}`:f.description,detail:f.id})),d=t.get("backend","");if(d){let f=a.findIndex(_=>_.detail===d);f>0&&a.unshift(...a.splice(f,1))}else a.reverse();let m=await v.window.showQuickPick(a,{title:"SageLLM: Select Inference Backend",placeHolder:"Choose hardware backend to use"});if(!m){e?.setGatewayStatus(!1);return}let l=m.detail;await t.update("backend",l,v.ConfigurationTarget.Global);let w=n.globalState.get("sagellm.recentModels",[]),h=t.get("preloadModel","").trim(),r=await v.window.withProgress({location:v.ProgressLocation.Notification,title:"SageLLM: Scanning models\u2026",cancellable:!1},()=>Ie(w,h)),g=Y.filter(f=>!de(f.id)).length,p=await v.window.showQuickPick(r,{title:`SageLLM: Select Model  (\u2601\uFE0F ${g} available to download)`,placeHolder:"\u2705 downloaded \xB7 \u2601\uFE0F will auto-download \xB7 $(edit) custom path",matchOnDescription:!0,matchOnDetail:!1});if(!p){e?.setGatewayStatus(!1);return}let u=p.detail;if(u==="__custom__"){if(u=await v.window.showInputBox({title:"SageLLM: Model Path or HuggingFace ID",prompt:"e.g.  Qwen/Qwen2.5-7B-Instruct  or  /models/my-model",value:h,ignoreFocusOut:!0})??"",!u.trim()){e?.setGatewayStatus(!1);return}u=u.trim()}if(!de(u)&&!u.startsWith("/")){if(await v.window.showInformationMessage(`"${u}" \u5C1A\u672A\u4E0B\u8F7D\u3002\u662F\u5426\u73B0\u5728\u4E0B\u8F7D\uFF1F`,{modal:!0},"\u4E0B\u8F7D","\u53D6\u6D88")!=="\u4E0B\u8F7D"){e?.setGatewayStatus(!1);return}if(!await Se(u)){e?.setGatewayStatus(!1);return}v.window.showInformationMessage(`\u2705 ${u} \u4E0B\u8F7D\u5B8C\u6210`)}await t.update("preloadModel",u,v.ConfigurationTarget.Global),await n.globalState.update("sagellm.recentModels",[u,...w.filter(f=>f!==u)].slice(0,10));let b=`${t.get("gatewayStartCommand","sagellm serve")} --backend ${l} --model ${u} --port ${o}`,L=v.window.createTerminal({name:"SageLLM Server",isTransient:!1,env:{SAGELLM_PREFLIGHT_CANARY:"0"}});L.sendText(b),L.show(!1),v.window.showInformationMessage(`SageLLM: Starting ${l.toUpperCase()} \xB7 ${u}\u2026`);let I=0,C=100,$=setInterval(async()=>{if(I++,await M())clearInterval($),e?.setGatewayStatus(!0),v.window.showInformationMessage(`SageLLM: Server ready \u2713  (${l} \xB7 ${u})`);else if(I>=C)clearInterval($),e?.setError("Server start timed out"),v.window.showWarningMessage("SageLLM: Server did not respond within 5 minutes. Check the terminal.");else if(I%20===0){let f=Math.round(I*3/60);v.window.setStatusBarMessage(`SageLLM: Loading model\u2026 (${f} min elapsed)`,5e3)}},3e3)}var D=null,k=null,N=null;async function Pe(n){let e=new Q(n);k=new V,n.subscriptions.push(k);let t=new R(n.extensionUri,e);n.subscriptions.push(c.window.registerWebviewViewProvider(R.viewType,t,{webviewOptions:{retainContextWhenHidden:!0}}));let o=new F(e),s=c.window.createTreeView("sagellm.modelsView",{treeDataProvider:o,showCollapseAll:!1});n.subscriptions.push(s);let a=new q(e);n.subscriptions.push(c.languages.registerInlineCompletionItemProvider({pattern:"**"},a)),n.subscriptions.push(c.commands.registerCommand("sagellm.openChat",()=>{let r=c.window.activeTextEditor,g=r?.document.getText(r.selection)??"";T.createOrShow(n.extensionUri,e,g||void 0)}),c.commands.registerCommand("sagellm.selectModel",async()=>{await e.selectModelInteractive(),k?.setModel(e.currentModel),o.refresh()}),c.commands.registerCommand("sagellm.refreshModels",async()=>{await c.window.withProgress({location:c.ProgressLocation.Notification,title:"SageLLM: Fetching models\u2026",cancellable:!1},async()=>{try{await e.refresh(),o.refresh(),c.window.showInformationMessage(`SageLLM: ${e.getModels().length} model(s) loaded`)}catch(r){c.window.showErrorMessage(`SageLLM: ${r instanceof y?r.message:String(r)}`)}})}),c.commands.registerCommand("sagellm.startGateway",()=>J(n,k)),c.commands.registerCommand("sagellm.configureServer",()=>J(n,k)),c.commands.registerCommand("sagellm.stopGateway",()=>ge(k)),c.commands.registerCommand("sagellm.showInstallGuide",()=>{_e(n.extensionUri)}),c.commands.registerCommand("sagellm.explainCode",()=>{let r=c.window.activeTextEditor;if(!r)return;let g=r.document.getText(r.selection);if(!g.trim()){c.window.showWarningMessage("SageLLM: Select some code first.");return}let p=r.document.languageId,u=c.workspace.asRelativePath(r.document.uri);T.invokeAction(n.extensionUri,e,`Explain this ${p} code from \`${u}\`:

\`\`\`${p}
${g}
\`\`\``)}),c.commands.registerCommand("sagellm.generateTests",()=>{let r=c.window.activeTextEditor;if(!r)return;let g=r.document.getText(r.selection);if(!g.trim()){c.window.showWarningMessage("SageLLM: Select a function or class first.");return}let p=r.document.languageId;T.invokeAction(n.extensionUri,e,`Write comprehensive unit tests for this ${p} code. Cover edge cases.

\`\`\`${p}
${g}
\`\`\``)}),c.commands.registerCommand("sagellm.fixCode",()=>{let r=c.window.activeTextEditor;if(!r)return;let g=r.document.getText(r.selection);if(!g.trim()){c.window.showWarningMessage("SageLLM: Select the code to fix.");return}let p=r.document.languageId;T.invokeAction(n.extensionUri,e,`Find bugs and fix this ${p} code. Show the corrected version with a brief explanation of each fix.

\`\`\`${p}
${g}
\`\`\``)}),c.commands.registerCommand("sagellm.generateDocstring",()=>{let r=c.window.activeTextEditor;if(!r)return;let g=r.document.getText(r.selection);if(!g.trim()){c.window.showWarningMessage("SageLLM: Select a function or class.");return}let p=r.document.languageId;T.invokeAction(n.extensionUri,e,`Write a docstring/JSDoc comment for this ${p} code. Follow the language's standard documentation style.

\`\`\`${p}
${g}
\`\`\``)}),c.commands.registerCommand("sagellm.checkConnection",async()=>{k?.setConnecting();let r=await M();if(k?.setGatewayStatus(r),r)await e.refresh().catch(()=>{}),o.refresh(),k?.setModel(e.currentModel),c.window.showInformationMessage("SageLLM: Gateway connected \u2713");else{let g=c.workspace.getConfiguration("sagellm"),p=g.get("gateway.host","localhost"),u=g.get("gateway.port",P),i=await c.window.showWarningMessage(`SageLLM: Cannot reach gateway at ${p}:${u}`,"Start Gateway","Installation Guide","Open Settings");i==="Start Gateway"?c.commands.executeCommand("sagellm.startGateway"):i==="Installation Guide"?c.commands.executeCommand("sagellm.showInstallGuide"):i==="Open Settings"&&c.commands.executeCommand("workbench.action.openSettings","@ext:intellistream.sagellm-vscode")}}));let d=c.workspace.getConfiguration("sagellm");if(d.get("autoStartGateway",!0)){let r=d.get("preloadModel","").trim(),g=d.get("backend","").trim();r&&g?M().then(p=>{p||$e(k)}):M().then(p=>{p||setTimeout(()=>J(n,k),1500)})}N=setInterval(async()=>{let r=await M();k?.setGatewayStatus(r),r&&e.currentModel&&k?.setModel(e.currentModel)},3e4),n.subscriptions.push({dispose:()=>{N&&clearInterval(N)}});async function m(r){let g=await M();if(k?.setGatewayStatus(g),g){let p=!1;try{let u=await e.refresh();if(o.refresh(),u.length>0){let i=e.currentModel||u[0].id,b=u.find(L=>L.id===i);await e.setModel(b?b.id:u[0].id),p=!0}k?.setModel(e.currentModel),e.currentModel&&T.notifyModelChanged(e.currentModel)}catch{}return p}else return r&&await c.window.showWarningMessage("SageLLM: Gateway not reachable. Configure and start now?","Configure Server","Dismiss")==="Configure Server"&&c.commands.executeCommand("sagellm.configureServer"),!1}let l=0,w=10;async function h(){if(l++,l>w)return;let r=Math.min(2e3*l,3e4);setTimeout(async()=>{let g=l>=3;await m(g)||h()},r)}h()}function Ae(){ge(k),N&&clearInterval(N)}function $e(n){let e=c.workspace.getConfiguration("sagellm"),t=e.get("gatewayStartCommand","sagellm serve"),o=e.get("gateway.port",P),s=e.get("preloadModel","").trim(),a=e.get("backend","").trim();if(D&&!D.killed){c.window.showInformationMessage("SageLLM: Gateway is already running");return}let d=t;a&&(d+=` --backend ${a}`),s&&(d+=` --model ${s}`),d+=` --port ${o}`;let m=c.window.createTerminal({name:"SageLLM Gateway",isTransient:!1,env:{SAGELLM_PREFLIGHT_CANARY:"0"}});m.sendText(d),m.show(!1),n?.setConnecting(),c.window.showInformationMessage(`SageLLM: Starting gateway with "${d}"\u2026`);let l=0,w=100,h=setInterval(async()=>{if(l++,await M())clearInterval(h),n?.setGatewayStatus(!0),c.window.showInformationMessage("SageLLM: Gateway is ready \u2713");else if(l>=w)clearInterval(h),n?.setError("Gateway start timed out"),c.window.showWarningMessage("SageLLM: Gateway did not respond within 5 minutes. Check the terminal for errors.");else if(l%20===0){let g=Math.round(l*3/60);n?.setConnecting(),c.window.setStatusBarMessage(`SageLLM: Loading model\u2026 (${g} min elapsed)`,5e3)}},3e3)}function ge(n){D&&!D.killed&&(D.kill("SIGTERM"),D=null),n?.setGatewayStatus(!1)}function _e(n){let e=c.window.createWebviewPanel("sagellm.installGuide","SageLLM: Installation Guide",c.ViewColumn.One,{enableScripts:!1});e.webview.html=Ge()}function Ge(){return`<!DOCTYPE html>
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
