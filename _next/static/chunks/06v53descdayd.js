(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,585043,e=>{"use strict";var t=e.i(234290),s=e.i(770345),r=e.i(211915),a=e.i(601642);let i=e=>{let t=9301*e+49297;return()=>(t=(9301*t+49297)%233280)/233280-.5},n=e=>Math.round(10*e)/10;function o(e){let t=`M${n(e[0][0])} ${n(e[0][1])}`;for(let s=0;s<e.length-1;s++){let r=e[s-1]??e[s],a=e[s],i=e[s+1],o=e[s+2]??i,l=[a[0]+(i[0]-r[0])/6,a[1]+(i[1]-r[1])/6],c=[i[0]-(o[0]-a[0])/6,i[1]-(o[1]-a[1])/6];t+=`C${n(l[0])} ${n(l[1])} ${n(c[0])} ${n(c[1])} ${n(i[0])} ${n(i[1])}`}return t}function l(e,t,s,r,a=1){let n=i(a),c=-2.2+.6*n(),d=1.12+.08*n(),h=-.05+.06*n(),u=[];for(let a=0;a<=26;a++){let i=c+a/26*d*Math.PI*2,o=1+a/26*.07,l=1+.05*n(),p=Math.cos(i)*s*o*l,f=Math.sin(i)*r*o*l;u.push([e+p*Math.cos(h)-f*Math.sin(h),t+p*Math.sin(h)+f*Math.cos(h)])}return o(u)}function c(e,t,s,r,a=1,n=.06){let l=i(a),d=(e+s)/2,h=(t+r)/2,u=Math.hypot(s-e,r-t),p=-(r-t)/u,f=(s-e)/u,m=u*(n+.03*l());return o([[e,t],[d+p*m+3*l(),h+f*m+3*l()],[s,r]])}function d(e,t,s,r=1){let a=i(r);return`${c(e-s,t-s+3*a(),e+s,t+s,r,.04)}${c(e+s+2*a(),t-s,e-s,t+s+3*a(),r+7,.05)}`}function h(e,t,s,r=10,a=1){let n=i(a);return o([[e,s-.6*r],[e+4,s+2*n()],[(e+t)/2,s+.25*r+2*n()],[t-4,s+2*n()],[t,s-.6*r]])}let u=a.default??{upstream:[]},p=(e,t,s)=>u.upstream.find(s=>s.issue===e&&s.commit===t)?.verdict??s,f="0000000344ad47185a30e91c245e8b0582b191e27d99fb40f9ff48ca0d7e1264ec879b2000000003deadbe00".match(/../g)??[],m=({d:e,at:s,w:r})=>(0,t.jsx)("path",{d:e,pathLength:1,className:"pen",style:{"--d":`${s}s`,strokeWidth:r}}),x=({x:e,y:s,at:r,end:a,children:i,size:n})=>(0,t.jsx)("text",{x:e,y:s,className:"pen-t",textAnchor:a?"end":"start",style:{"--d":`${r}s`,fontSize:n},children:i}),g=({x1:e,x2:s,y:r,label:a,hot:i,labelAt:n})=>(0,t.jsxs)("g",{className:`pf-dim${i?" pf-dim-hot":""}`,children:[(0,t.jsx)("path",{d:`M${e} ${r-8}V${r+20}M${s} ${r-8}V${r+20}`,className:"pf-tick"}),(0,t.jsx)("path",{d:`M${e} ${r}H${s}`}),s-e>22?(0,t.jsx)("path",{d:`M${e} ${r}l7 -3v6zM${s} ${r}l-7 -3v6z`,className:"pf-fill"}):null,(0,t.jsx)("text",{x:"end"===n?s:(e+s)/2,y:"end"===n?r-22:r-8,textAnchor:"end"===n?"end":"middle",children:a})]}),v=[["u32","1","10"],["i32","1","20"],["u64","1","30"],["string",'"1"',"40"],["symbol","1","50"]],b=[{id:"signer",tab:"A signer that halted ingestion",short:"Signer",meta:["CAP-0040","testnet ledger 4437357","44 bytes"],title:(0,t.jsx)(t.Fragment,{children:"A signer with a payload. Three builds of wallet-backend met it."}),entry:{id:"signer.signed-payload.set-options",href:"/docs/corpus/entries/signer-signed-payload-set-options"},by:"make replay",issue:{label:"wallet-backend#729",href:"https://github.com/stellar/wallet-backend/pull/729"},runs:[{build:"79ea2acd",note:"keeps 33 of 41 key bytes",verdict:p("#729","79ea2acd","mishandled")},{build:"6e5a5910",note:"stops at ledger 4437357",verdict:p("#729","6e5a5910","halted")},{build:"2c873353",note:"the fix: all 41 bytes",verdict:p("#729","2c873353","handled")}],wide:function(){let e=1200/44;return(0,t.jsxs)("svg",{viewBox:"0 0 1200 290",className:"pf-svg",role:"img","aria-label":"The 44-byte signed-payload SignerKey from testnet ledger 4437357, with the bytes a 33-byte column loses marked in pen.",children:[[{a:0,b:4,label:"TYPE · 3"},{a:4,b:36,label:"ED25519 KEY · 32 BYTES"},{a:36,b:40,label:"LENGTH · 3"},{a:40,b:43,label:"PAYLOAD",hot:!0},{a:43,b:44,label:"PAD",end:!0}].map(s=>(0,t.jsx)(g,{x1:s.a*e+.5,x2:s.b*e-.5,y:44,label:s.label,hot:s.hot,labelAt:s.end?"end":void 0},s.label)),f.map((s,r)=>{let a=r>=40&&r<43;return(0,t.jsxs)("g",{className:"pf-cell-g",style:{"--i":r},children:[(0,t.jsx)("rect",{x:r*e+.5,y:74,width:e-1,height:52,className:a?"pf-cell pf-cell-hot":"pf-cell"}),(0,t.jsx)("text",{x:r*e+e/2,y:105,textAnchor:"middle",className:a?"pf-hex pf-hex-hot":"pf-hex",children:s}),r%4==0?(0,t.jsx)("text",{x:r*e+2,y:141,className:"pf-idx",children:String(r).padStart(2,"0")}):null]},r)}),(0,t.jsx)(m,{d:l(41.5*e,100,64,46,3),at:1}),(0,t.jsx)(m,{d:h(36*e+4,1196,160,12,5),at:1.5}),(0,t.jsx)(m,{d:function(e=1,t=.12){let s=c(700,214,1080,176,e,t),r=Math.atan2(-38,380)+1.4*t,a=e=>`M${n(1080-13*Math.cos(r-e))} ${n(176-13*Math.sin(r-e))}L${n(1080)} ${n(176)}`;return`${s}${a(.5)}${a(-.5)}`}(9,.1),at:1.8}),(0,t.jsx)(x,{x:684,y:209,end:!0,at:2.1,children:"a 33-byte column keeps the key,"}),(0,t.jsx)(x,{x:684,y:233,end:!0,at:2.25,children:"then loses length, payload and pad"}),(0,t.jsx)("text",{x:684,y:262,textAnchor:"end",className:"pf-src",children:"wallet-backend#716 · strkey P… is 41 bytes here"})]})},narrow:function(){let e=[16,60,104,148];return(0,t.jsxs)("svg",{viewBox:"0 0 352 300",className:"pf-svg",role:"img","aria-label":"The 44-byte signed-payload SignerKey, eleven bytes a row, with the lost bytes marked in pen.",children:[f.map((s,r)=>{let a=Math.floor(r/11),i=r%11,n=r>=40&&r<43;return(0,t.jsxs)("g",{className:"pf-cell-g",style:{"--i":r},children:[(0,t.jsx)("rect",{x:32*i+.5,y:e[a],width:31,height:38,className:n?"pf-cell pf-cell-hot":"pf-cell"}),(0,t.jsx)("text",{x:32*i+16,y:e[a]+19+5,textAnchor:"middle",className:n?"pf-hex pf-hex-hot":"pf-hex",style:{fontSize:13},children:s})]},r)}),(0,t.jsx)(m,{d:l(272,e[3]+19,60,34,3),at:1}),(0,t.jsx)(m,{d:h(99,350,200,10,5),at:1.4}),(0,t.jsx)(x,{x:0,y:238,at:1.8,size:14,children:"a 33-byte column keeps the key,"}),(0,t.jsx)(x,{x:0,y:258,at:1.95,size:14,children:"loses length, payload and pad"}),(0,t.jsx)("text",{x:0,y:284,className:"pf-src",children:"wallet-backend#716 · CAP-0040"})]})}},{id:"trust",tab:"A trustline nobody announced",short:"Trustline",meta:["CAP-0073","Stellar Asset Contract","no event"],title:(0,t.jsx)(t.Fragment,{children:"A contract call creates a trustline. No operation, no event says so."}),entry:{id:"sac.trust.creates-trustline",href:"/docs/corpus/entries/sac-trust-creates-trustline"},by:"make replay",issue:{label:"wallet-backend#731",href:"https://github.com/stellar/wallet-backend/issues/731"},runs:[{build:"764a4f5b",note:"records no TRUSTLINE/ADD",verdict:p("#731","764a4f5b","dropped")},{build:"c152783c",note:"the fix: records it",verdict:p("#731","c152783c","handled")}],wide:function(){return(0,t.jsxs)("svg",{viewBox:"0 0 1200 290",className:"pf-svg",role:"img","aria-label":"A Stellar Asset Contract trust call creates bob's XPF trustline as a created ledger entry, with no CHANGE_TRUST operation and no event.",children:[(0,t.jsx)("text",{x:0,y:14,className:"pf-lab",children:"TRANSACTION"}),(0,t.jsx)("rect",{x:.5,y:26,width:399,height:238,className:"pf-frame"}),(0,t.jsx)("rect",{x:20,y:48,width:360,height:110,className:"pf-box"}),(0,t.jsx)("text",{x:36,y:76,className:"pf-mono-s",children:"op 0 · invoke_host_function"}),(0,t.jsx)("text",{x:36,y:102,className:"pf-mono-s pf-mute",children:"XPF Stellar Asset Contract"}),(0,t.jsx)("text",{x:36,y:140,className:"pf-mono-l",children:"trust( bob )"}),(0,t.jsx)("text",{x:36,y:200,className:"pf-mono-s pf-mute",children:"operation events"}),(0,t.jsx)("text",{x:364,y:200,textAnchor:"end",className:"pf-mono-s",children:"0"}),(0,t.jsx)("text",{x:36,y:232,className:"pf-mono-s pf-mute",children:"CHANGE_TRUST operations"}),(0,t.jsx)("text",{x:364,y:232,textAnchor:"end",className:"pf-mono-s",children:"0"}),(0,t.jsx)("path",{d:"M412 104H500",className:"pf-rule-s"}),(0,t.jsx)("path",{d:"M500 104l-8 -4v8z",className:"pf-fill"}),(0,t.jsx)("text",{x:456,y:94,textAnchor:"middle",className:"pf-lab",children:"APPLIES"}),(0,t.jsx)("text",{x:520,y:14,className:"pf-lab",children:"LEDGER CHANGES"}),(0,t.jsx)("rect",{x:520.5,y:26,width:679,height:238,className:"pf-frame"}),(0,t.jsx)("rect",{x:540,y:48,width:640,height:86,className:"pf-box pf-box-hot"}),(0,t.jsx)("text",{x:560,y:82,className:"pf-mono-l",children:"CREATED · TRUSTLINE"}),(0,t.jsx)("text",{x:560,y:112,className:"pf-mono-s",children:"bob · XPF · balance 0 · limit i64::MAX"}),(0,t.jsx)("rect",{x:540,y:150,width:640,height:40,className:"pf-box pf-box-none"}),(0,t.jsx)("text",{x:560,y:175,className:"pf-mono-s pf-mute",children:"CHANGE_TRUST operation"}),(0,t.jsx)("text",{x:1164,y:175,textAnchor:"end",className:"pf-mono-s pf-mute",children:"none"}),(0,t.jsx)("rect",{x:540,y:204,width:640,height:40,className:"pf-box pf-box-none"}),(0,t.jsx)("text",{x:560,y:229,className:"pf-mono-s pf-mute",children:"operation event"}),(0,t.jsx)("text",{x:1164,y:229,textAnchor:"end",className:"pf-mono-s pf-mute",children:"none"}),(0,t.jsx)(m,{d:l(700,92,178,52,4),at:1}),(0,t.jsx)(m,{d:d(1144,170,9,2),at:1.45,w:2.4}),(0,t.jsx)(m,{d:d(1144,224,9,6),at:1.6,w:2.4}),(0,t.jsx)(x,{x:1180,y:84,end:!0,at:1.8,children:"the only trace"}),(0,t.jsx)(x,{x:1180,y:108,end:!0,at:1.9,children:"of the trustline"}),(0,t.jsx)(x,{x:520,y:284,at:2.2,size:14,children:"readers waiting for an operation or an event never see it · #731"})]})},narrow:function(){return(0,t.jsxs)("svg",{viewBox:"0 0 352 400",className:"pf-svg",role:"img","aria-label":"A trust call creates a trustline with no CHANGE_TRUST operation and no event.",children:[(0,t.jsx)("text",{x:0,y:12,className:"pf-lab",children:"TRANSACTION"}),(0,t.jsx)("rect",{x:.5,y:22,width:351,height:92,className:"pf-box"}),(0,t.jsx)("text",{x:14,y:48,className:"pf-mono-s",children:"op 0 · invoke_host_function"}),(0,t.jsx)("text",{x:14,y:70,className:"pf-mono-s pf-mute",children:"XPF Stellar Asset Contract"}),(0,t.jsx)("text",{x:14,y:100,className:"pf-mono-l",style:{fontSize:19},children:"trust( bob )"}),(0,t.jsx)("path",{d:"M176 122V150",className:"pf-rule-s"}),(0,t.jsx)("path",{d:"M176 150l-4 -8h8z",className:"pf-fill"}),(0,t.jsx)("text",{x:0,y:170,className:"pf-lab",children:"LEDGER CHANGES"}),(0,t.jsx)("rect",{x:.5,y:180,width:351,height:74,className:"pf-box pf-box-hot"}),(0,t.jsx)("text",{x:14,y:210,className:"pf-mono-l",style:{fontSize:17},children:"CREATED · TRUSTLINE"}),(0,t.jsx)("text",{x:14,y:236,className:"pf-mono-s",style:{fontSize:12},children:"bob · XPF · limit i64::MAX"}),(0,t.jsx)("rect",{x:.5,y:264,width:351,height:34,className:"pf-box pf-box-none"}),(0,t.jsx)("text",{x:14,y:286,className:"pf-mono-s pf-mute",style:{fontSize:12},children:"CHANGE_TRUST operation · none"}),(0,t.jsx)("rect",{x:.5,y:306,width:351,height:34,className:"pf-box pf-box-none"}),(0,t.jsx)("text",{x:14,y:328,className:"pf-mono-s pf-mute",style:{fontSize:12},children:"operation event · none"}),(0,t.jsx)(m,{d:l(120,220,132,46,4),at:1}),(0,t.jsx)(m,{d:d(328,281,8,2),at:1.4,w:2.2}),(0,t.jsx)(m,{d:d(328,323,8,6),at:1.55,w:2.2}),(0,t.jsx)(x,{x:0,y:370,at:1.8,size:14,children:"the only trace: no op, no event"}),(0,t.jsx)("text",{x:0,y:394,className:"pf-src",children:"wallet-backend#731 · CAP-0073"})]})}},{id:"keys",tab:"Five keys that read as one",short:"Map keys",meta:["CAP-0046","ScMap","5 keys → 1"],title:(0,t.jsx)(t.Fragment,{children:"Five distinct map keys. Converted to an object, one survives."}),entry:{id:"scval.map.keys-collide-on-native-conversion",href:"/docs/corpus/entries/scval-map-keys-collide-on-native-conversion"},by:"make conformance",issue:{label:"js-stellar-sdk#1789",href:"https://github.com/stellar/js-stellar-sdk/issues/1789"},runs:[{build:"js 17.2.0",note:"drops colliding keys",verdict:"fail"},{build:"js 17.2.1",note:"drops colliding keys",verdict:"fail"},{build:"js 17.3.0",note:"the fix: no silent drop",verdict:"pass"}],wide:function(){return(0,t.jsxs)("svg",{viewBox:"0 0 1200 290",className:"pf-svg",role:"img","aria-label":"An ScMap with five distinct keys (u32 1, i32 1, u64 1, string 1, symbol 1) converted to a native object keyed by text: one key comes out.",children:[(0,t.jsx)("text",{x:0,y:16,className:"pf-lab",children:"SCMAP ON CHAIN · 5 DISTINCT KEYS"}),v.map(([e,s,r],a)=>(0,t.jsxs)("g",{className:"pf-cell-g",style:{"--i":4*a},children:[(0,t.jsx)("rect",{x:.5,y:32+48*a,width:339,height:38,className:"pf-box"}),(0,t.jsx)("text",{x:16,y:32+48*a+25,className:"pf-mono-s pf-mute",children:e}),(0,t.jsx)("text",{x:110,y:32+48*a+26,className:"pf-mono-l",style:{fontSize:20},children:s}),(0,t.jsxs)("text",{x:322,y:32+48*a+25,textAnchor:"end",className:"pf-mono-s",children:["→ ",r]}),(0,t.jsx)("path",{d:`M340 ${32+48*a+19}C470 ${32+48*a+19} 520 150 640 150`,className:"pf-rule-s"})]},e)),(0,t.jsx)("rect",{x:640.5,y:130,width:180,height:40,className:"pf-box"}),(0,t.jsx)("text",{x:730,y:155,textAnchor:"middle",className:"pf-mono-s",children:"scValToNative"}),(0,t.jsx)("path",{d:"M821 150H900",className:"pf-rule-s"}),(0,t.jsx)("path",{d:"M900 150l-8 -4v8z",className:"pf-fill"}),(0,t.jsx)("text",{x:910,y:96,className:"pf-lab",children:"NATIVE OBJECT · 1 KEY"}),(0,t.jsx)("rect",{x:910.5,y:106,width:289,height:88,className:"pf-box pf-box-hot"}),(0,t.jsx)("text",{x:1055,y:162,textAnchor:"middle",className:"pf-mono-l",style:{fontSize:30},children:'{ "1": … }'}),(0,t.jsx)(m,{d:l(1055,150,170,72,8),at:1}),(0,t.jsx)(m,{d:c(356,30,356,258,4,.03),at:1.4}),(0,t.jsx)(x,{x:1196,y:252,end:!0,at:1.8,children:"5 keys in, 1 key out:"}),(0,t.jsx)(x,{x:1196,y:276,end:!0,at:1.95,children:"4 values dropped, no error · #1789"})]})},narrow:function(){return(0,t.jsxs)("svg",{viewBox:"0 0 352 420",className:"pf-svg",role:"img","aria-label":"Five distinct ScMap keys become one key in a native object.",children:[(0,t.jsx)("text",{x:0,y:12,className:"pf-lab",children:"SCMAP · 5 DISTINCT KEYS"}),v.map(([e,s,r],a)=>(0,t.jsxs)("g",{className:"pf-cell-g",style:{"--i":4*a},children:[(0,t.jsx)("rect",{x:.5,y:22+42*a,width:351,height:34,className:"pf-box"}),(0,t.jsx)("text",{x:14,y:22+42*a+22,className:"pf-mono-s pf-mute",style:{fontSize:12},children:e}),(0,t.jsx)("text",{x:100,y:22+42*a+23,className:"pf-mono-l",style:{fontSize:17},children:s}),(0,t.jsxs)("text",{x:336,y:22+42*a+22,textAnchor:"end",className:"pf-mono-s",style:{fontSize:12},children:["→ ",r]})]},e)),(0,t.jsx)("path",{d:"M176 236V262",className:"pf-rule-s"}),(0,t.jsx)("path",{d:"M176 262l-4 -8h8z",className:"pf-fill"}),(0,t.jsx)("text",{x:176,y:282,textAnchor:"middle",className:"pf-mono-s",style:{fontSize:12},children:"scValToNative"}),(0,t.jsx)("rect",{x:60.5,y:294,width:231,height:62,className:"pf-box pf-box-hot"}),(0,t.jsx)("text",{x:176,y:334,textAnchor:"middle",className:"pf-mono-l",style:{fontSize:24},children:'{ "1": … }'}),(0,t.jsx)(m,{d:l(176,325,136,46,8),at:1}),(0,t.jsx)(x,{x:0,y:396,at:1.6,size:14,children:"5 keys in, 1 out, no error"}),(0,t.jsx)("text",{x:0,y:416,className:"pf-src",children:"js-stellar-sdk#1789 · CAP-0046"})]})}}],y={handled:"pass",pass:"pass",halted:"fail",fail:"fail",mishandled:"warn",dropped:"warn",crashed:"fail",stalled:"warn"};e.s(["PenUnderline",0,function({seed:e=2}){return(0,t.jsx)("svg",{className:"pen-u",viewBox:"0 0 400 24",preserveAspectRatio:"none","aria-hidden":!0,children:(0,t.jsx)("path",{d:function(e=1){let t=i(e),s=[];for(let e=0;e<=6;e++)s.push([4+392*e/6,9+4*t()+e/6*2]);return s.push([378,18]),o(s)}(e),pathLength:1,className:"pen",style:{"--d":"0.9s"}})})},"Proof",0,function(){let[e,a]=(0,r.useState)(0),[i,n]=(0,r.useState)(0),o=(0,r.useRef)(!1),l=b[e];return(0,r.useEffect)(()=>{if(matchMedia("(prefers-reduced-motion: reduce)").matches)return;let e=setInterval(()=>{o.current||document.hidden||(a(e=>(e+1)%b.length),n(e=>e+1))},9e3);return()=>clearInterval(e)},[]),(0,t.jsxs)("div",{className:"pf-stack",onMouseEnter:()=>o.current=!0,onMouseLeave:()=>o.current=!1,children:[(0,t.jsx)("div",{className:"pf-under pf-under-1","aria-hidden":!0}),(0,t.jsx)("div",{className:"pf-under pf-under-2","aria-hidden":!0}),(0,t.jsxs)("figure",{className:"pf",children:[(0,t.jsx)("span",{className:"pf-crop pf-crop-tl","aria-hidden":!0}),(0,t.jsx)("span",{className:"pf-crop pf-crop-tr","aria-hidden":!0}),(0,t.jsx)("span",{className:"pf-crop pf-crop-bl","aria-hidden":!0}),(0,t.jsx)("span",{className:"pf-crop pf-crop-br","aria-hidden":!0}),(0,t.jsx)("div",{className:"pf-tabs",role:"tablist","aria-label":"Real shapes that broke real code",children:b.map((s,r)=>(0,t.jsxs)("button",{type:"button",role:"tab","aria-selected":r===e,className:"pf-tab",onClick:()=>{o.current=!0,a(r),n(e=>e+1)},children:[(0,t.jsx)("span",{className:"pf-tab-n",children:String(r+1).padStart(2,"0")}),(0,t.jsx)("span",{className:"pf-tab-l",children:s.tab}),(0,t.jsx)("span",{className:"pf-tab-s",children:s.short}),r===e?(0,t.jsx)("span",{className:"pf-tab-bar"},i):null]},s.id))}),(0,t.jsxs)("div",{className:"pf-body",role:"tabpanel",children:[(0,t.jsxs)("div",{className:"pf-head",children:[(0,t.jsx)("p",{className:"pf-title",children:l.title}),(0,t.jsx)("p",{className:"pf-meta",children:l.meta.map(e=>(0,t.jsx)("span",{children:e},e))})]}),(0,t.jsx)("div",{className:"pf-art pf-art-wide",children:l.wide()}),(0,t.jsx)("div",{className:"pf-art pf-art-narrow",children:l.narrow()}),(0,t.jsx)("div",{className:"pf-runs",style:{gridTemplateColumns:`repeat(${l.runs.length}, minmax(0, 1fr))`},children:l.runs.map((e,s)=>(0,t.jsxs)("div",{className:"pf-run",style:{"--d":`${2.3+.35*s}s`},children:[(0,t.jsx)("span",{className:"pf-run-b",children:e.build}),(0,t.jsx)("span",{className:"pf-run-n",children:e.note}),(0,t.jsx)("span",{className:`pf-chip pf-${y[e.verdict]??"warn"}`,children:e.verdict.toUpperCase()})]},e.build))}),(0,t.jsxs)("div",{className:"pf-foot",children:[(0,t.jsxs)("span",{children:["Entry ",(0,t.jsx)(s.default,{href:l.entry.href,children:l.entry.id})]}),(0,t.jsxs)("span",{children:["Reproduced by ",(0,t.jsx)("code",{children:l.by})," · ",(0,t.jsx)("a",{href:l.issue.href,children:l.issue.label})]})]})]},`${l.id}-${i}`),(0,t.jsxs)("svg",{className:"pf-reg",viewBox:"0 0 28 28","aria-hidden":!0,children:[(0,t.jsx)("circle",{cx:"14",cy:"14",r:"8"}),(0,t.jsx)("path",{d:"M14 0v28M0 14h28"})]})]})]})}],585043)},413279,e=>{"use strict";var t=e.i(234290),s=e.i(211915);let r="922,337,203,685",a=r+".4775807";e.s(["Specimen",0,function(){let e=(0,s.useRef)(null),i=(0,s.useRef)(null),[n,o]=(0,s.useState)(120),[l,c]=(0,s.useState)(a),[d,h]=(0,s.useState)(!1),[u,p]=(0,s.useState)(null);(0,s.useLayoutEffect)(()=>{let t=()=>{if(!e.current||!i.current)return;let t=i.current;t.style.fontSize="100px";let s=t.scrollWidth;o(Math.min(200,100*e.current.clientWidth/s*.995)),t.style.fontSize=""};t(),addEventListener("resize",t),document.fonts?.addEventListener("loadingdone",t);let s=i.current?getComputedStyle(i.current).fontFamily.split(",")[0]:"";return s&&document.fonts?.load(`200 100px ${s}`).then(t).catch(()=>{}),()=>{removeEventListener("resize",t),document.fonts?.removeEventListener("loadingdone",t)}},[]),(0,s.useLayoutEffect)(()=>{let t=e.current;if(!t)return;let s=t.getBoundingClientRect(),r=[...t.querySelectorAll("[data-dec]")],a=[...t.querySelectorAll("[data-tail]")];if(!r.length||!a.length)return;let i=r[0].getBoundingClientRect(),n=r[r.length-1].getBoundingClientRect(),o=a[0].getBoundingClientRect(),l=a[a.length-1].getBoundingClientRect();p({up:[i.left-s.left,n.right-i.left,i.top-s.top],down:[o.left-s.left,l.right-o.left,o.bottom-s.top+4]})},[n,d]),(0,s.useEffect)(()=>{let t,s=e.current;if(!s)return;if(matchMedia("(prefers-reduced-motion: reduce)").matches)return void h(!0);let r=[],i=new IntersectionObserver(([e])=>{if(!e.isIntersecting)return;i.disconnect();let s=performance.now(),n=400+70*a.length;t=setInterval(()=>{let e=performance.now()-s;c([...a].map((t,s)=>/\d/.test(t)&&e<400+70*s?String(Math.floor(10*Math.random())):t).join(""))},40),r.push(setTimeout(()=>{clearInterval(t),c(a)},n)),r.push(setTimeout(()=>h(!0),n+700))},{threshold:.35});return i.observe(s),()=>{i.disconnect(),clearInterval(t),r.forEach(clearTimeout)}},[]);let f=(e,s)=>[...l.slice(e,s)].map((s,r)=>{let i=e+r;if(!/\d/.test(s))return(0,t.jsx)("span",{className:"h-sep",children:s},i);let n=i>=a.length-3,o=i>a.indexOf(".");return(0,t.jsx)("span",{className:`h-d${n&&d?" h-lost":""}`,"data-tail":n||void 0,"data-dec":o||void 0,children:s},i)});return(0,t.jsxs)("div",{ref:e,className:"h-num",style:{fontSize:n},"aria-label":"922,337,203,685.4775807",children:[(0,t.jsx)("div",{ref:i,className:"h-l1",children:f(0,r.length)}),(0,t.jsxs)("div",{className:"h-l2",children:[(0,t.jsx)("div",{className:"h-l2n",children:f(r.length,a.length)}),(0,t.jsxs)("div",{className:"h-under",children:[(0,t.jsxs)("p",{children:[(0,t.jsx)("b",{children:"Exact"}),"A 64-bit integer of stroops: 9,223,372,036,854,775,807. Every digit is real."]}),(0,t.jsxs)("p",{children:[(0,t.jsx)("b",{children:"As a float64"}),(0,t.jsx)("span",{className:"h-loss",children:"922,337,203,685.4775"}),(0,t.jsx)("br",{}),"The last three digits are gone."]}),(0,t.jsxs)("p",{children:[(0,t.jsx)("b",{children:"On record"}),"Hazard ",(0,t.jsx)("a",{href:"/docs/hazards/layer-b#h-b3",children:"H-B3"}),": amounts as lossy floats, ",(0,t.jsx)("a",{href:"https://github.com/stellar/stellar-etl/issues/454",children:"stellar-etl#454"})]})]})]}),u&&d?(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)("div",{className:"h-br h-up",style:{left:u.up[0],width:u.up[1],top:u.up[2]},children:(0,t.jsx)("span",{children:"7 decimals · stroops"})}),(0,t.jsx)("div",{className:"h-br h-down",style:{left:u.down[0],width:u.down[1],top:u.down[2]},children:(0,t.jsx)("span",{children:"lost as float64"})})]}):null]})}])},931352,e=>{"use strict";var t=e.i(234290),s=e.i(775050);e.s(["ThemeToggle",0,function(){let{resolvedTheme:e,setTheme:r}=(0,s.i)();return(0,t.jsx)("button",{type:"button",className:"h-theme","aria-label":"Toggle light and dark",onClick:()=>r("dark"===e?"light":"dark"),children:(0,t.jsxs)("svg",{width:"15",height:"15",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"1.8","aria-hidden":!0,children:[(0,t.jsx)("circle",{cx:"12",cy:"12",r:"4.5"}),(0,t.jsx)("path",{d:"M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"})]})})}])},768228,e=>{"use strict";var t=e.i(234290),s=e.i(211915);let r=`#version 300 es
precision mediump float;

layout(location = 0) in vec4 a_position;

uniform vec2 u_resolution;
uniform float u_pixelRatio;
uniform float u_imageAspectRatio;
uniform float u_originX;
uniform float u_originY;
uniform float u_worldWidth;
uniform float u_worldHeight;
uniform float u_fit;
uniform float u_scale;
uniform float u_rotation;
uniform float u_offsetX;
uniform float u_offsetY;

out vec2 v_objectUV;
out vec2 v_objectBoxSize;
out vec2 v_responsiveUV;
out vec2 v_responsiveBoxGivenSize;
out vec2 v_patternUV;
out vec2 v_patternBoxSize;
out vec2 v_imageUV;

vec3 getBoxSize(float boxRatio, vec2 givenBoxSize) {
  vec2 box = vec2(0.);
  // fit = none
  box.x = boxRatio * min(givenBoxSize.x / boxRatio, givenBoxSize.y);
  float noFitBoxWidth = box.x;
  if (u_fit == 1.) { // fit = contain
    box.x = boxRatio * min(u_resolution.x / boxRatio, u_resolution.y);
  } else if (u_fit == 2.) { // fit = cover
    box.x = boxRatio * max(u_resolution.x / boxRatio, u_resolution.y);
  }
  box.y = box.x / boxRatio;
  return vec3(box, noFitBoxWidth);
}

void main() {
  gl_Position = a_position;

  vec2 uv = gl_Position.xy * .5;
  vec2 boxOrigin = vec2(.5 - u_originX, u_originY - .5);
  vec2 givenBoxSize = vec2(u_worldWidth, u_worldHeight);
  givenBoxSize = max(givenBoxSize, vec2(1.)) * u_pixelRatio;
  float r = u_rotation * 3.14159265358979323846 / 180.;
  mat2 graphicRotation = mat2(cos(r), sin(r), -sin(r), cos(r));
  vec2 graphicOffset = vec2(-u_offsetX, u_offsetY);


  // ===================================================

  float fixedRatio = 1.;
  vec2 fixedRatioBoxGivenSize = vec2(
  (u_worldWidth == 0.) ? u_resolution.x : givenBoxSize.x,
  (u_worldHeight == 0.) ? u_resolution.y : givenBoxSize.y
  );

  v_objectBoxSize = getBoxSize(fixedRatio, fixedRatioBoxGivenSize).xy;
  vec2 objectWorldScale = u_resolution.xy / v_objectBoxSize;

  v_objectUV = uv;
  v_objectUV *= objectWorldScale;
  v_objectUV += boxOrigin * (objectWorldScale - 1.);
  v_objectUV += graphicOffset;
  v_objectUV /= u_scale;
  v_objectUV = graphicRotation * v_objectUV;

  // ===================================================

  v_responsiveBoxGivenSize = vec2(
  (u_worldWidth == 0.) ? u_resolution.x : givenBoxSize.x,
  (u_worldHeight == 0.) ? u_resolution.y : givenBoxSize.y
  );
  float responsiveRatio = v_responsiveBoxGivenSize.x / v_responsiveBoxGivenSize.y;
  vec2 responsiveBoxSize = getBoxSize(responsiveRatio, v_responsiveBoxGivenSize).xy;
  vec2 responsiveBoxScale = u_resolution.xy / responsiveBoxSize;

  #ifdef ADD_HELPERS
  v_responsiveHelperBox = uv;
  v_responsiveHelperBox *= responsiveBoxScale;
  v_responsiveHelperBox += boxOrigin * (responsiveBoxScale - 1.);
  #endif

  v_responsiveUV = uv;
  v_responsiveUV *= responsiveBoxScale;
  v_responsiveUV += boxOrigin * (responsiveBoxScale - 1.);
  v_responsiveUV += graphicOffset;
  v_responsiveUV /= u_scale;
  v_responsiveUV.x *= responsiveRatio;
  v_responsiveUV = graphicRotation * v_responsiveUV;
  v_responsiveUV.x /= responsiveRatio;

  // ===================================================

  float patternBoxRatio = givenBoxSize.x / givenBoxSize.y;
  vec2 patternBoxGivenSize = vec2(
  (u_worldWidth == 0.) ? u_resolution.x : givenBoxSize.x,
  (u_worldHeight == 0.) ? u_resolution.y : givenBoxSize.y
  );
  patternBoxRatio = patternBoxGivenSize.x / patternBoxGivenSize.y;

  vec3 boxSizeData = getBoxSize(patternBoxRatio, patternBoxGivenSize);
  v_patternBoxSize = boxSizeData.xy;
  float patternBoxNoFitBoxWidth = boxSizeData.z;
  vec2 patternBoxScale = u_resolution.xy / v_patternBoxSize;

  v_patternUV = uv;
  v_patternUV += graphicOffset / patternBoxScale;
  v_patternUV += boxOrigin;
  v_patternUV -= boxOrigin / patternBoxScale;
  v_patternUV *= u_resolution.xy;
  v_patternUV /= u_pixelRatio;
  if (u_fit > 0.) {
    v_patternUV *= (patternBoxNoFitBoxWidth / v_patternBoxSize.x);
  }
  v_patternUV /= u_scale;
  v_patternUV = graphicRotation * v_patternUV;
  v_patternUV += boxOrigin / patternBoxScale;
  v_patternUV -= boxOrigin;
  // x100 is a default multiplier between vertex and fragmant shaders
  // we use it to avoid UV presision issues
  v_patternUV *= .01;

  // ===================================================

  vec2 imageBoxSize;
  if (u_fit == 1.) { // contain
    imageBoxSize.x = min(u_resolution.x / u_imageAspectRatio, u_resolution.y) * u_imageAspectRatio;
  } else if (u_fit == 2.) { // cover
    imageBoxSize.x = max(u_resolution.x / u_imageAspectRatio, u_resolution.y) * u_imageAspectRatio;
  } else {
    imageBoxSize.x = min(10.0, 10.0 / u_imageAspectRatio * u_imageAspectRatio);
  }
  imageBoxSize.y = imageBoxSize.x / u_imageAspectRatio;
  vec2 imageBoxScale = u_resolution.xy / imageBoxSize;

  v_imageUV = uv;
  v_imageUV *= imageBoxScale;
  v_imageUV += boxOrigin * (imageBoxScale - 1.);
  v_imageUV += graphicOffset;
  v_imageUV /= u_scale;
  v_imageUV.x *= u_imageAspectRatio;
  v_imageUV = graphicRotation * v_imageUV;
  v_imageUV.x /= u_imageAspectRatio;

  v_imageUV += .5;
  v_imageUV.y = 1. - v_imageUV.y;
}`,a=8294400;class i{parentElement;canvasElement;gl;program=null;uniformLocations={};fragmentShader;rafId=null;lastRenderTime=0;currentFrame=0;speed=0;currentSpeed=0;providedUniforms;mipmaps=[];hasBeenDisposed=!1;resolutionChanged=!0;textures=new Map;minPixelRatio;maxPixelCount;isSafari=(function(){let e=navigator.userAgent.toLowerCase();return e.includes("safari")&&!e.includes("chrome")&&!e.includes("android")})();uniformCache={};textureUnitMap=new Map;ownerDocument;constructor(e,t,s,r,i=0,n=0,l=2,c=a,d=[]){if(e?.nodeType===1)this.parentElement=e;else throw Error("Paper Shaders: parent element must be an HTMLElement");if(this.ownerDocument=e.ownerDocument,!this.ownerDocument.querySelector("style[data-paper-shader]")){let e=this.ownerDocument.createElement("style");e.innerHTML=o,e.setAttribute("data-paper-shader",""),this.ownerDocument.head.prepend(e)}let h=this.ownerDocument.createElement("canvas");this.canvasElement=h,this.parentElement.prepend(h),this.fragmentShader=t,this.providedUniforms=s,this.mipmaps=d,this.currentFrame=n,this.minPixelRatio=l,this.maxPixelCount=c;let u=h.getContext("webgl2",{antialias:!1,depth:!1,stencil:!1,...r});if(!u)throw Error("Paper Shaders: WebGL is not supported in this browser");this.gl=u,this.initProgram(),this.setupPositionAttribute(),this.setupUniforms(),this.setUniformValues(this.providedUniforms),this.setupResizeObserver(),visualViewport?.addEventListener("resize",this.handleVisualViewportChange),this.setupIntersectionObserver(),this.setSpeed(i),this.parentElement.setAttribute("data-paper-shader",""),this.parentElement.paperShaderMount=this,this.ownerDocument.addEventListener("visibilitychange",this.handleDocumentVisibilityChange)}initProgram=()=>{let e=function(e,t,s){let r=e.getShaderPrecisionFormat(e.FRAGMENT_SHADER,e.MEDIUM_FLOAT),a=r?r.precision:null;a&&a<23&&(t=t.replace(/precision\s+(lowp|mediump)\s+float;/g,"precision highp float;"),s=s.replace(/precision\s+(lowp|mediump)\s+float/g,"precision highp float").replace(/\b(uniform|varying|attribute)\s+(lowp|mediump)\s+(\w+)/g,"$1 highp $3"));let i=n(e,e.VERTEX_SHADER,t),o=n(e,e.FRAGMENT_SHADER,s);if(!i||!o)return null;let l=e.createProgram();return l?(e.attachShader(l,i),e.attachShader(l,o),e.linkProgram(l),e.getProgramParameter(l,e.LINK_STATUS))?(e.detachShader(l,i),e.detachShader(l,o),e.deleteShader(i),e.deleteShader(o),l):(console.error("Unable to initialize the shader program: "+e.getProgramInfoLog(l)),e.deleteProgram(l),e.deleteShader(i),e.deleteShader(o),null):null}(this.gl,r,this.fragmentShader);e&&(this.program=e,this.gl.useProgram(e))};setupPositionAttribute=()=>{let e=this.gl.getAttribLocation(this.program,"a_position"),t=this.gl.createBuffer();this.gl.bindBuffer(this.gl.ARRAY_BUFFER,t),this.gl.bufferData(this.gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),this.gl.STATIC_DRAW),this.gl.enableVertexAttribArray(e),this.gl.vertexAttribPointer(e,2,this.gl.FLOAT,!1,0,0)};setupUniforms=()=>{let e={u_time:this.gl.getUniformLocation(this.program,"u_time"),u_pixelRatio:this.gl.getUniformLocation(this.program,"u_pixelRatio"),u_resolution:this.gl.getUniformLocation(this.program,"u_resolution")};Object.entries(this.providedUniforms).forEach(([t,s])=>{if(e[t]=this.gl.getUniformLocation(this.program,t),s instanceof HTMLImageElement){let s=`${t}AspectRatio`;e[s]=this.gl.getUniformLocation(this.program,s)}}),this.uniformLocations=e};renderScale=1;parentWidth=0;parentHeight=0;parentDevicePixelWidth=0;parentDevicePixelHeight=0;devicePixelsSupported=!1;intersectionObserver=null;isInViewport=!0;resizeObserver=null;setupResizeObserver=()=>{this.resizeObserver=new ResizeObserver(([e])=>{if(e?.borderBoxSize[0]){let t=e.devicePixelContentBoxSize?.[0];void 0!==t&&(this.devicePixelsSupported=!0,this.parentDevicePixelWidth=t.inlineSize,this.parentDevicePixelHeight=t.blockSize),this.parentWidth=e.borderBoxSize[0].inlineSize,this.parentHeight=e.borderBoxSize[0].blockSize}this.handleResize()}),this.resizeObserver.observe(this.parentElement)};setupIntersectionObserver=()=>{let e=this.ownerDocument.defaultView;e?.IntersectionObserver&&(this.intersectionObserver=new e.IntersectionObserver(([e])=>{this.isInViewport=e?.isIntersecting??!0,this.updateCurrentSpeed()}),this.intersectionObserver.observe(this.parentElement))};handleVisualViewportChange=()=>{this.resizeObserver?.disconnect(),this.setupResizeObserver()};handleResize=()=>{let e=0,t=0,s=Math.max(1,window.devicePixelRatio),r=visualViewport?.scale??1;if(this.devicePixelsSupported){let a=Math.max(1,this.minPixelRatio/s);e=this.parentDevicePixelWidth*a*r,t=this.parentDevicePixelHeight*a*r}else{var a;let i,n,o=Math.max(s,this.minPixelRatio)*r;this.isSafari&&(o*=Math.max(1,(a=this.ownerDocument,(n=Math.round(100*(i=outerWidth/((visualViewport?.scale??1)*(visualViewport?.width??window.innerWidth)+(window.innerWidth-a.documentElement.clientWidth)))))%5==0?n/100:33===n?1/3:67===n?2/3:133===n?4/3:i))),e=Math.round(this.parentWidth)*o,t=Math.round(this.parentHeight)*o}let i=Math.min(1,Math.sqrt(this.maxPixelCount)/Math.sqrt(e*t)),n=Math.round(e*i),o=Math.round(t*i),l=n/Math.round(this.parentWidth);(this.canvasElement.width!==n||this.canvasElement.height!==o||this.renderScale!==l)&&(this.renderScale=l,this.canvasElement.width=n,this.canvasElement.height=o,this.resolutionChanged=!0,this.gl.viewport(0,0,this.gl.canvas.width,this.gl.canvas.height),this.render(performance.now()))};render=e=>{if(this.hasBeenDisposed)return;if(null===this.program)return void console.warn("Tried to render before program or gl was initialized");let t=e-this.lastRenderTime;this.lastRenderTime=e,0!==this.currentSpeed&&(this.currentFrame+=t*this.currentSpeed),this.gl.clear(this.gl.COLOR_BUFFER_BIT),this.gl.uniform1f(this.uniformLocations.u_time,.001*this.currentFrame),this.resolutionChanged&&(this.gl.uniform2f(this.uniformLocations.u_resolution,this.gl.canvas.width,this.gl.canvas.height),this.gl.uniform1f(this.uniformLocations.u_pixelRatio,this.renderScale),this.resolutionChanged=!1),this.gl.drawArrays(this.gl.TRIANGLES,0,6),0!==this.currentSpeed?this.requestRender():this.rafId=null};requestRender=()=>{null!==this.rafId&&cancelAnimationFrame(this.rafId),this.rafId=requestAnimationFrame(this.render)};setTextureUniform=(e,t)=>{if(!t.complete||0===t.naturalWidth)throw Error(`Paper Shaders: image for uniform ${e} must be fully loaded`);let s=this.textures.get(e);s&&this.gl.deleteTexture(s),this.textureUnitMap.has(e)||this.textureUnitMap.set(e,this.textureUnitMap.size);let r=this.textureUnitMap.get(e);this.gl.activeTexture(this.gl.TEXTURE0+r);let a=this.gl.createTexture();this.gl.bindTexture(this.gl.TEXTURE_2D,a),this.gl.texParameteri(this.gl.TEXTURE_2D,this.gl.TEXTURE_WRAP_S,this.gl.CLAMP_TO_EDGE),this.gl.texParameteri(this.gl.TEXTURE_2D,this.gl.TEXTURE_WRAP_T,this.gl.CLAMP_TO_EDGE),this.gl.texParameteri(this.gl.TEXTURE_2D,this.gl.TEXTURE_MIN_FILTER,this.gl.LINEAR),this.gl.texParameteri(this.gl.TEXTURE_2D,this.gl.TEXTURE_MAG_FILTER,this.gl.LINEAR),this.gl.texImage2D(this.gl.TEXTURE_2D,0,this.gl.RGBA,this.gl.RGBA,this.gl.UNSIGNED_BYTE,t),this.mipmaps.includes(e)&&(this.gl.generateMipmap(this.gl.TEXTURE_2D),this.gl.texParameteri(this.gl.TEXTURE_2D,this.gl.TEXTURE_MIN_FILTER,this.gl.LINEAR_MIPMAP_LINEAR));let i=this.gl.getError();if(i!==this.gl.NO_ERROR||null===a)return void console.error("Paper Shaders: WebGL error when uploading texture:",i);this.textures.set(e,a);let n=this.uniformLocations[e];if(n){this.gl.uniform1i(n,r);let s=`${e}AspectRatio`,a=this.uniformLocations[s];if(a){let e=t.naturalWidth/t.naturalHeight;this.gl.uniform1f(a,e)}}};areUniformValuesEqual=(e,t)=>e===t||!!(Array.isArray(e)&&Array.isArray(t))&&e.length===t.length&&e.every((e,s)=>this.areUniformValuesEqual(e,t[s]));setUniformValues=e=>{Object.entries(e).forEach(([e,t])=>{let s=t;if(t instanceof HTMLImageElement&&(s=`${t.src.slice(0,200)}|${t.naturalWidth}x${t.naturalHeight}`),this.areUniformValuesEqual(this.uniformCache[e],s))return;this.uniformCache[e]=s;let r=this.uniformLocations[e];if(!r)return void console.warn(`Uniform location for ${e} not found`);if(t instanceof HTMLImageElement)this.setTextureUniform(e,t);else if(Array.isArray(t)){let s=null,a=null;if(void 0!==t[0]&&Array.isArray(t[0])){let r=t[0].length;if(!t.every(e=>e.length===r))return void console.warn(`All child arrays must be the same length for ${e}`);s=t.flat(),a=r}else a=(s=t).length;switch(a){case 2:this.gl.uniform2fv(r,s);break;case 3:this.gl.uniform3fv(r,s);break;case 4:this.gl.uniform4fv(r,s);break;case 9:this.gl.uniformMatrix3fv(r,!1,s);break;case 16:this.gl.uniformMatrix4fv(r,!1,s);break;default:console.warn(`Unsupported uniform array length: ${a}`)}}else"number"==typeof t?this.gl.uniform1f(r,t):"boolean"==typeof t?this.gl.uniform1i(r,+!!t):console.warn(`Unsupported uniform type for ${e}: ${typeof t}`)})};getCurrentFrame=()=>this.currentFrame;setFrame=e=>{this.currentFrame=e,this.lastRenderTime=performance.now(),this.renderUnlessAnimating()};setSpeed=(e=1)=>{this.speed=e,this.updateCurrentSpeed()};updateCurrentSpeed=()=>{this.setCurrentSpeed(this.ownerDocument.hidden||!this.isInViewport?0:this.speed)};setCurrentSpeed=e=>{this.currentSpeed=e,null===this.rafId&&0!==e&&(this.lastRenderTime=performance.now(),this.rafId=requestAnimationFrame(this.render)),null!==this.rafId&&0===e&&(cancelAnimationFrame(this.rafId),this.rafId=null)};setMaxPixelCount=(e=a)=>{this.maxPixelCount=e,this.handleResize()};setMinPixelRatio=(e=2)=>{this.minPixelRatio=e,this.handleResize()};setUniforms=e=>{this.setUniformValues(e),this.providedUniforms={...this.providedUniforms,...e},this.renderUnlessAnimating()};renderUnlessAnimating=()=>{null===this.rafId&&this.render(performance.now())};handleDocumentVisibilityChange=()=>{this.updateCurrentSpeed()};dispose=()=>{this.hasBeenDisposed=!0,null!==this.rafId&&(cancelAnimationFrame(this.rafId),this.rafId=null),this.gl&&this.program&&(this.textures.forEach(e=>{this.gl.deleteTexture(e)}),this.textures.clear(),this.gl.deleteProgram(this.program),this.program=null,this.gl.bindBuffer(this.gl.ARRAY_BUFFER,null),this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER,null),this.gl.bindRenderbuffer(this.gl.RENDERBUFFER,null),this.gl.bindFramebuffer(this.gl.FRAMEBUFFER,null),this.gl.getError()),this.gl.getExtension("WEBGL_lose_context")?.loseContext(),this.resizeObserver&&(this.resizeObserver.disconnect(),this.resizeObserver=null),this.intersectionObserver&&(this.intersectionObserver.disconnect(),this.intersectionObserver=null),visualViewport?.removeEventListener("resize",this.handleVisualViewportChange),this.ownerDocument.removeEventListener("visibilitychange",this.handleDocumentVisibilityChange),this.uniformLocations={},this.canvasElement.remove(),delete this.parentElement.paperShaderMount}}function n(e,t,s){let r=e.createShader(t);return r?(e.shaderSource(r,s),e.compileShader(r),e.getShaderParameter(r,e.COMPILE_STATUS))?r:(console.error("An error occurred compiling the shaders: "+e.getShaderInfoLog(r)),e.deleteShader(r),null):null}let o=`@layer paper-shaders {
  :where([data-paper-shader]) {
    isolation: isolate;
    position: relative;

    & canvas {
      contain: strict;
      display: block;
      position: absolute;
      inset: 0;
      z-index: -1;
      width: 100%;
      height: 100%;
      border-radius: inherit;
      corner-shape: inherit;
    }
  }
}`;function l(e){if(e.naturalWidth<1024&&e.naturalHeight<1024){if(e.naturalWidth<1||e.naturalHeight<1)return;let t=e.naturalWidth/e.naturalHeight;e.width=Math.round(t>1?1024*t:1024),e.height=Math.round(t>1?1024:1024/t)}}async function c(e){let t={},s=[];return Object.entries(e).forEach(([e,r])=>{if("string"==typeof r){let a=r||"data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";if(!(e=>{try{if(e.startsWith("/"))return!0;return new URL(e),!0}catch{return!1}})(a))return void console.warn(`Uniform "${e}" has invalid URL "${a}". Skipping image loading.`);let i=new Promise((s,r)=>{let i=new Image;(e=>{try{if(e.startsWith("/"))return!1;return new URL(e,window.location.origin).origin!==window.location.origin}catch{return!1}})(a)&&(i.crossOrigin="anonymous"),i.onload=()=>{l(i),t[e]=i,s()},i.onerror=()=>{console.error(`Could not set uniforms. Failed to load image at ${a}`),r()},i.src=a});s.push(i)}else if(r instanceof HTMLImageElement){let a=r.decode().then(()=>{l(r),t[e]=r});s.push(a)}else t[e]=r}),await Promise.all(s),t}let d=(0,s.forwardRef)(function({fragmentShader:e,uniforms:r,webGlContextAttributes:a,speed:n=0,frame:o=0,width:l,height:d,minPixelRatio:h,maxPixelCount:u,mipmaps:p,style:f,...m},x){var g;let v,b,[y,w]=(0,s.useState)(!1),_=(0,s.useRef)(null),S=(0,s.useRef)(null),j=(0,s.useRef)(a);(0,s.useEffect)(()=>((async()=>{let t=await c(r);_.current&&!S.current&&(S.current=new i(_.current,e,t,j.current,n,o,h,u,p),w(!0))})(),()=>{S.current?.dispose(),S.current=null}),[e]),(0,s.useEffect)(()=>{let e=!1;return(async()=>{let t=await c(r);e||S.current?.setUniforms(t)})(),()=>{e=!0}},[r,y]),(0,s.useEffect)(()=>{S.current?.setSpeed(n)},[n,y]),(0,s.useEffect)(()=>{S.current?.setMaxPixelCount(u)},[u,y]),(0,s.useEffect)(()=>{S.current?.setMinPixelRatio(h)},[h,y]),(0,s.useEffect)(()=>{S.current?.setFrame(o)},[o,y]);let A=(g=[_,x],v=s.useRef(void 0),b=s.useCallback(e=>{let t=g.map(t=>{if(null!=t){if("function"==typeof t){let s=t(e);return"function"==typeof s?s:()=>{t(null)}}return t.current=e,()=>{t.current=null}}});return()=>{t.forEach(e=>e?.())}},g),s.useMemo(()=>g.every(e=>null==e)?null:e=>{v.current&&(v.current(),v.current=void 0),null!=e&&(v.current=b(e))},g));return(0,t.jsx)("div",{ref:A,style:void 0!==l||void 0!==d?{width:"string"==typeof l&&!1===isNaN(+l)?+l:l,height:"string"==typeof d&&!1===isNaN(+d)?+d:d,...f}:f,...m})});d.displayName="ShaderMount";let h={fit:"contain",scale:1,rotation:0,offsetX:0,offsetY:0,originX:.5,originY:.5,worldWidth:0,worldHeight:0},u={none:0,contain:1,cover:2};function p(e){if(Array.isArray(e))return 4===e.length?e:3===e.length?[...e,1]:m;if("string"!=typeof e)return m;let t,s,r,a=1;if(e.startsWith("#")){var i;(3===(i=(i=e).replace(/^#/,"")).length||4===i.length)&&(i=i.split("").map(e=>e+e).join("")),6===i.length&&(i+="ff"),[t,s,r,a]=/^[0-9a-f]{8}$/i.test(i)?[parseInt(i.slice(0,2),16)/255,parseInt(i.slice(2,4),16)/255,parseInt(i.slice(4,6),16)/255,parseInt(i.slice(6,8),16)/255]:(console.warn("Invalid hex color"),m)}else if(e.startsWith("rgb")){let i,n=(i=e.match(/^rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([0-9.]+))?\s*\)$/i))?[parseInt(i[1]??"0")/255,parseInt(i[2]??"0")/255,parseInt(i[3]??"0")/255,void 0===i[4]?1:parseFloat(i[4])]:null;if(null===n)return m;[t,s,r,a]=n}else{let i;if(!e.startsWith("hsl"))return console.error("Unsupported color format",e),m;let n=(i=e.match(/^hsla?\s*\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%\s*(?:,\s*([0-9.]+))?\s*\)$/i))?[parseInt(i[1]??"0"),parseInt(i[2]??"0"),parseInt(i[3]??"0"),void 0===i[4]?1:parseFloat(i[4])]:null;if(null===n)return m;[t,s,r,a]=function(e){let t,s,r,[a,i,n,o]=e,l=a/360,c=i/100,d=n/100;if(0===i)t=s=r=d;else{let e=(e,t,s)=>(s<0&&(s+=1),s>1&&(s-=1),s<1/6)?e+(t-e)*6*s:s<.5?t:s<2/3?e+(t-e)*(2/3-s)*6:e,a=d<.5?d*(1+c):d+c-d*c,i=2*d-a;t=e(i,a,l+1/3),s=e(i,a,l),r=e(i,a,l-1/3)}return[t,s,r,o]}(n)}return[f(t,0,1),f(s,0,1),f(r,0,1),f(a,0,1)]}let f=(e,t,s)=>Math.min(Math.max(e,t),s),m=[.5,.5,.5,1],x=`
#define TWO_PI 6.28318530718
#define PI 3.14159265358979323846
`,g=`
vec2 rotate(vec2 uv, float th) {
  return mat2(cos(th), sin(th), -sin(th), cos(th)) * uv;
}
`,v=`
  float hash21(vec2 p) {
    p = fract(p * vec2(0.3183099, 0.3678794)) + 0.1;
    p += dot(p, p + 19.19);
    return fract(p.x * p.y);
  }
`,b=`#version 300 es
precision mediump float;

uniform float u_time;

uniform vec4 u_colors[10];
uniform float u_colorsCount;

uniform float u_distortion;
uniform float u_swirl;
uniform float u_grainMixer;
uniform float u_grainOverlay;

in vec2 v_objectUV;
out vec4 fragColor;

${x}
${g}
${v}

float valueNoise(vec2 st) {
  vec2 i = floor(st);
  vec2 f = fract(st);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  float x1 = mix(a, b, u.x);
  float x2 = mix(c, d, u.x);
  return mix(x1, x2, u.y);
}

float noise(vec2 n, vec2 seedOffset) {
  return valueNoise(n + seedOffset);
}

vec2 getPosition(int i, float t) {
  float a = float(i) * .37;
  float b = .6 + fract(float(i) / 3.) * .9;
  float c = .8 + fract(float(i + 1) / 4.);

  float x = sin(t * b + a);
  float y = cos(t * c + a * 1.5);

  return .5 + .5 * vec2(x, y);
}

void main() {
  vec2 uv = v_objectUV;
  uv += .5;
  vec2 grainUV = uv * 1000.;

  float mixerGrain = 0.;
  if (u_grainMixer > 0.) {
    mixerGrain = .4 * u_grainMixer * (noise(grainUV, vec2(0.)) - .5);
  }

  const float firstFrameOffset = 41.5;
  float t = .5 * (u_time + firstFrameOffset);

  float radius = smoothstep(0., 1., length(uv - .5));
  float center = 1. - radius;
  for (float i = 1.; i <= 2.; i++) {
    uv.x += u_distortion * center / i * sin(t + i * .4 * smoothstep(.0, 1., uv.y)) * cos(.2 * t + i * 2.4 * smoothstep(.0, 1., uv.y));
    uv.y += u_distortion * center / i * cos(t + i * 2. * smoothstep(.0, 1., uv.x));
  }

  vec2 uvRotated = uv;
  uvRotated -= vec2(.5);
  float angle = 3. * u_swirl * radius;
  uvRotated = rotate(uvRotated, -angle);
  uvRotated += vec2(.5);

  vec3 color = vec3(0.);
  float opacity = 0.;
  float totalWeight = 0.;

  for (int i = 0; i < 10; i++) {
    if (i >= int(u_colorsCount)) break;

    vec2 pos = getPosition(i, t) + mixerGrain;
    vec3 colorFraction = u_colors[i].rgb * u_colors[i].a;
    float opacityFraction = u_colors[i].a;

    float dist = length(uvRotated - pos);

    dist = pow(dist, 3.5);
    float weight = 1. / (dist + 1e-3);
    color += colorFraction * weight;
    opacity += opacityFraction * weight;
    totalWeight += weight;
  }

  color /= max(1e-4, totalWeight);
  opacity /= max(1e-4, totalWeight);

  if (u_grainOverlay > 0.) {
    float grainOverlay = valueNoise(rotate(grainUV, 1.) + vec2(3.));
    grainOverlay = mix(grainOverlay, valueNoise(rotate(grainUV, 2.) + vec2(-1.)), .5);
    grainOverlay = pow(grainOverlay, 1.3);

    float grainOverlayV = grainOverlay * 2. - 1.;
    vec3 grainOverlayColor = vec3(step(0., grainOverlayV));
    float grainOverlayStrength = u_grainOverlay * abs(grainOverlayV);
    grainOverlayStrength = pow(grainOverlayStrength, .8);
    color = mix(color, grainOverlayColor, .35 * grainOverlayStrength);

    opacity += .5 * grainOverlayStrength;
  }
  opacity = clamp(opacity, 0., 1.);

  fragColor = vec4(color, opacity);
}
`,y={name:"Default",params:{...h,speed:1,frame:0,colors:["#e0eaff","#241d9a","#f75092","#9f50d3"],distortion:.8,swirl:.1,grainMixer:0,grainOverlay:0}},w=(0,s.memo)(function({speed:e=y.params.speed,frame:s=y.params.frame,colors:r=y.params.colors,distortion:a=y.params.distortion,swirl:i=y.params.swirl,grainMixer:n=y.params.grainMixer,grainOverlay:o=y.params.grainOverlay,fit:l=y.params.fit,rotation:c=y.params.rotation,scale:h=y.params.scale,originX:f=y.params.originX,originY:m=y.params.originY,offsetX:x=y.params.offsetX,offsetY:g=y.params.offsetY,worldWidth:v=y.params.worldWidth,worldHeight:w=y.params.worldHeight,..._}){let S={u_colors:r.map(p),u_colorsCount:r.length,u_distortion:a,u_swirl:i,u_grainMixer:n,u_grainOverlay:o,u_fit:u[l],u_rotation:c,u_scale:h,u_offsetX:x,u_offsetY:g,u_originX:f,u_originY:m,u_worldWidth:v,u_worldHeight:w};return(0,t.jsx)(d,{..._,speed:e,frame:s,fragmentShader:b,uniforms:S})},function(e,t){if(Object.keys(e).length!==Object.keys(t).length)return!1;for(let s in e){if("colors"===s){let s=Array.isArray(e.colors),r=Array.isArray(t.colors);if(!s||!r){if(!1===Object.is(e.colors,t.colors))return!1;continue}if(e.colors?.length!==t.colors?.length||!e.colors?.every((e,s)=>e===t.colors?.[s]))return!1;continue}if(!1===Object.is(e[s],t[s]))return!1}return!0}),_=["#FBF8F3","#FFF0B8","#F3EDDC","#FFE070","#F0EBE0","#FFFAEA"],S=["#0F0F0E","#2E2606","#141412","#6E5606","#111110","#191712"];e.s(["PaperField",0,function({className:e,frame:r=41e3}){let a=function(){let[e,t]=(0,s.useState)(null);return(0,s.useEffect)(()=>{let e=document.documentElement;t(e.classList.contains("dark"));let s=new MutationObserver(()=>t(e.classList.contains("dark")));return s.observe(e,{attributes:!0,attributeFilter:["class"]}),()=>s.disconnect()},[]),e}();return null===a?null:(0,t.jsx)(w,{className:e,style:{width:"100%",height:"100%"},colors:a?S:_,distortion:.9,swirl:.35,grainMixer:.18,grainOverlay:a?.42:.32,speed:0,frame:r,maxPixelCount:336e4},String(a))}],768228)},601642,(e,t,s)=>{t.exports={upstream:[{issue:"#729",url:"https://github.com/stellar/wallet-backend/pull/729",ledger:"SetOptions adds a signed-payload (P...) signer, on testnet ledger 4437357 (1 variant)",commit:"79ea2acd",verdict:"mishandled",probes:"addresses.valid, signer.added"},{issue:"#729",url:"https://github.com/stellar/wallet-backend/pull/729",ledger:"SetOptions adds a signed-payload (P...) signer, on testnet ledger 4437357 (1 variant)",commit:"6e5a5910",verdict:"halted",probes:""},{issue:"#729",url:"https://github.com/stellar/wallet-backend/pull/729",ledger:"SetOptions adds a signed-payload (P...) signer, on testnet ledger 4437357 (1 variant)",commit:"2a0a84ea",verdict:"halted",probes:""},{issue:"#729",url:"https://github.com/stellar/wallet-backend/pull/729",ledger:"SetOptions adds a signed-payload (P...) signer, on testnet ledger 4437357 (1 variant)",commit:"2c873353",verdict:"handled",probes:""},{issue:"#731",url:"https://github.com/stellar/wallet-backend/issues/731",ledger:"a Stellar Asset Contract trust() creates a trustline with no event (CAP-0073) (4 variants)",commit:"764a4f5b",verdict:"dropped",probes:"trustline.added"},{issue:"#731",url:"https://github.com/stellar/wallet-backend/issues/731",ledger:"a Stellar Asset Contract trust() creates a trustline with no event (CAP-0073) (4 variants)",commit:"c152783c",verdict:"handled",probes:""},{issue:"#753",url:"https://github.com/stellar/wallet-backend/pull/753",ledger:"a muxed (M...) source on ExtendFootprintTTL and RestoreFootprint, with a text memo (4 variants)",commit:"f8e5786d",verdict:"halted",probes:""},{issue:"#753",url:"https://github.com/stellar/wallet-backend/pull/753",ledger:"a muxed (M...) source on ExtendFootprintTTL and RestoreFootprint, with a text memo (4 variants)",commit:"bb0b162b",verdict:"handled",probes:""},{issue:"#745",url:"https://github.com/stellar/wallet-backend/issues/745",ledger:"a contract deploy whose deployer is a claimable-balance (B...) address, refused by the host but in the ledger (2 variants)",commit:"71625b21",verdict:"halted",probes:""},{issue:"#745",url:"https://github.com/stellar/wallet-backend/issues/745",ledger:"a contract deploy whose deployer is a claimable-balance (B...) address, refused by the host but in the ledger (2 variants)",commit:"ce0820d7",verdict:"handled",probes:""},{issue:"#745",url:"https://github.com/stellar/wallet-backend/issues/745",ledger:"a contract deploy whose deployer is a liquidity-pool (L...) address, refused by the host but in the ledger (2 variants)",commit:"71625b21",verdict:"mishandled",probes:"facts.extra"},{issue:"#745",url:"https://github.com/stellar/wallet-backend/issues/745",ledger:"a contract deploy whose deployer is a liquidity-pool (L...) address, refused by the host but in the ledger (2 variants)",commit:"ce0820d7",verdict:"handled",probes:""}],main:{commit:"18db88f4",variants:634,sessions:364,dropped:14,handled:618,mishandled:2},open:[{variant:"backfill.p22-refunds-in-tx-changes-after@p22-mainnet-mined-l56085459",entry:"backfill.p22-refunds-in-tx-changes-after",verdict:"mishandled",failed:7,why:"F-3. Before protocol 23 a Soroban fee refund is credited in txChangesAfter; wallet-backend's native balances read fee changes, operation changes and post-apply refunds (protocol 23+) only, so the 7 refunded accounts of pubnet ledger 56085459 end short by exactly their refund, while its own BALANCE history rows add up to the ledger.",upstream:null},{variant:"contract.sac-deploy-from-asset@p28-mainnet-generated",entry:"contract.sac-deploy-from-asset",verdict:"dropped",failed:1,why:"A Stellar Asset Contract deploy declares no auth entry, and wallet-backend records contract creations only from auth entries and the operation's own FromAddress preimage.",upstream:["https://github.com/stellar/wallet-backend/issues/815"]},{variant:"contract.sac-deploy-from-asset@p28-testnet-generated",entry:"contract.sac-deploy-from-asset",verdict:"dropped",failed:1,why:"A Stellar Asset Contract deploy declares no auth entry, and wallet-backend records contract creations only from auth entries and the operation's own FromAddress preimage.",upstream:["https://github.com/stellar/wallet-backend/issues/815"]},{variant:"contract.sac-deploy-from-asset@p30-mainnet-generated",entry:"contract.sac-deploy-from-asset",verdict:"dropped",failed:1,why:"A Stellar Asset Contract deploy declares no auth entry, and wallet-backend records contract creations only from auth entries and the operation's own FromAddress preimage.",upstream:["https://github.com/stellar/wallet-backend/issues/815"]},{variant:"contract.sac-deploy-from-asset@p30-testnet-generated",entry:"contract.sac-deploy-from-asset",verdict:"dropped",failed:1,why:"A Stellar Asset Contract deploy declares no auth entry, and wallet-backend records contract creations only from auth entries and the operation's own FromAddress preimage.",upstream:["https://github.com/stellar/wallet-backend/issues/815"]},{variant:"failure.manage-buy-offer.buy-not-authorized-p22@p22-mainnet-mined-l56085459",entry:"failure.manage-buy-offer.buy-not-authorized-p22",verdict:"mishandled",failed:7,why:"F-3. Before protocol 23 a Soroban fee refund is credited in txChangesAfter; wallet-backend's native balances read fee changes, operation changes and post-apply refunds (protocol 23+) only, so the 7 refunded accounts of pubnet ledger 56085459 end short by exactly their refund, while its own BALANCE history rows add up to the ledger.",upstream:null},{variant:"preauth.failing-tx-still-removes-signer@p30-mainnet-generated",entry:"preauth.failing-tx-still-removes-signer",verdict:"dropped",failed:1,why:"Core removes a used pre-auth signer in txChangesBefore even when the transaction fails (CAP-0028); wallet-backend reads signer changes from operation effects only.",upstream:["https://github.com/stellar/wallet-backend/issues/805","https://github.com/stellar/wallet-backend/issues/818"]},{variant:"preauth.failing-tx-still-removes-signer@p30-testnet-generated",entry:"preauth.failing-tx-still-removes-signer",verdict:"dropped",failed:1,why:"Core removes a used pre-auth signer in txChangesBefore even when the transaction fails (CAP-0028); wallet-backend reads signer changes from operation effects only.",upstream:["https://github.com/stellar/wallet-backend/issues/805","https://github.com/stellar/wallet-backend/issues/818"]},{variant:"revoke.cascade-offers-pool-shares@p30-mainnet-generated",entry:"revoke.cascade-offers-pool-shares",verdict:"dropped",failed:1,why:"Revoking authorization redeems the holder's pool shares and deletes the pool-share trustline (CAP-0038); wallet-backend writes TRUSTLINE REMOVE only from ChangeTrust.",upstream:["https://github.com/stellar/wallet-backend/issues/817"]},{variant:"revoke.cascade-offers-pool-shares@p30-testnet-generated",entry:"revoke.cascade-offers-pool-shares",verdict:"dropped",failed:1,why:"Revoking authorization redeems the holder's pool shares and deletes the pool-share trustline (CAP-0038); wallet-backend writes TRUSTLINE REMOVE only from ChangeTrust.",upstream:["https://github.com/stellar/wallet-backend/issues/817"]},{variant:"sac.xlm-transfer-creates-account@p28-mainnet-generated",entry:"sac.xlm-transfer-creates-account",verdict:"dropped",failed:1,why:"An account created by an XLM transfer through the native asset contract (CAP-0073) gets no ACCOUNT CREATE: wallet-backend writes one only for a CreateAccount operation.",upstream:["https://github.com/stellar/wallet-backend/issues/804","https://github.com/stellar/wallet-backend/issues/816"]},{variant:"sac.xlm-transfer-creates-account@p28-testnet-generated",entry:"sac.xlm-transfer-creates-account",verdict:"dropped",failed:1,why:"An account created by an XLM transfer through the native asset contract (CAP-0073) gets no ACCOUNT CREATE: wallet-backend writes one only for a CreateAccount operation.",upstream:["https://github.com/stellar/wallet-backend/issues/804","https://github.com/stellar/wallet-backend/issues/816"]},{variant:"sac.xlm-transfer-creates-account@p30-mainnet-generated",entry:"sac.xlm-transfer-creates-account",verdict:"dropped",failed:1,why:"An account created by an XLM transfer through the native asset contract (CAP-0073) gets no ACCOUNT CREATE: wallet-backend writes one only for a CreateAccount operation.",upstream:["https://github.com/stellar/wallet-backend/issues/804","https://github.com/stellar/wallet-backend/issues/816"]},{variant:"sac.xlm-transfer-creates-account@p30-testnet-generated",entry:"sac.xlm-transfer-creates-account",verdict:"dropped",failed:1,why:"An account created by an XLM transfer through the native asset contract (CAP-0073) gets no ACCOUNT CREATE: wallet-backend writes one only for a CreateAccount operation.",upstream:["https://github.com/stellar/wallet-backend/issues/804","https://github.com/stellar/wallet-backend/issues/816"]},{variant:"signer.preauth-removed-by-core@p30-mainnet-generated",entry:"signer.preauth-removed-by-core",verdict:"dropped",failed:1,why:"Core removes the used pre-auth signer in txChangesBefore, outside any operation; wallet-backend never reads that change group for signers.",upstream:["https://github.com/stellar/wallet-backend/issues/818"]},{variant:"signer.preauth-removed-by-core@p30-testnet-generated",entry:"signer.preauth-removed-by-core",verdict:"dropped",failed:1,why:"Core removes the used pre-auth signer in txChangesBefore, outside any operation; wallet-backend never reads that change group for signers.",upstream:["https://github.com/stellar/wallet-backend/issues/818"]}]}}]);