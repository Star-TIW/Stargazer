(() => {
  "use strict";
  const tvButton=document.getElementById("sg-tv-tab");
  const section=document.getElementById("sg-tv");
  const sports=document.querySelector("div.live-scroll-container");
  const list=document.getElementById("sg-tv-live-list");
  const header=document.getElementById("sg-tv-live-toggle");
  if(!tvButton||!section||!sports||!list||!header)return;
  const commonNames=[
    "abc","cbs","nbc","fox","pbs","cw","espn","espn2","cnn","foxnews",
    "msnbc","cnbc","tnt","tbs","usanetwork","fx","fxx","amc",
    "a&e","history","discovery","nationalgeographic","animalplanet",
    "foodnetwork","hgtv","tlc","cartoonnetwork","nickelodeon","disneychannel",
    "comedycentral","mtv","bet","bravo","e","lifetimetv","lifetime",
    "hallmark","nflnetwork","nbatv","mlbnetwork","foxsports1",
    "fs1","fs2","espnu","accnetwork","bigtennetwork","secnetwork"
  ];
  const rank=name=>{
    const normalized=String(name||"").toLowerCase().replace(/[^a-z0-9]/g,"");
    const exact=commonNames.indexOf(normalized);
    if(exact>=0)return exact;
    // Prefer a recognizable channel's regional/HD variant over unrelated listings.
    const prefix=commonNames.findIndex(key=>key.length>=3&&normalized.startsWith(key)&&/^(?:hd|us|usa|east|west|live|24|plus|[0-9])/.test(normalized.slice(key.length)));
    return prefix>=0?prefix+0.5:999;
  };
  const uniqueSources=entries=>{
    const result=new Map();
    for(const entry of entries||[]){
      for(const variant of [{embed:entry.embed,name:"DAMITV"},...(Array.isArray(entry.sources)?entry.sources:[])]){
        try{
          const url=new URL(variant.embed);
          if(!["https://damitv.st","https://ondemand.st"].includes(url.origin)||
             url.username||url.password||!/^\/(?:embed|player\/[^/]+)\/?$/.test(url.pathname))continue;
          result.set(url.href,{url:url.href,name:variant.name?"DAMITV · "+variant.name:"DAMITV"});
        }catch{}
      }
    }
    return [...result.values()];
  };
  const normalize=s=>String(s||"").trim().toLowerCase().replace(/\s+/g," ");
  const channelsFrom=data=>{
    if(data?.success!==true||!Array.isArray(data.streams))throw Error("Invalid channel catalog");
    const grouped=new Map();
    for(const group of data.streams){
      if(!Array.isArray(group?.streams))continue;
      for(const entry of group.streams){
        if(!entry||typeof entry.name!=="string"||!entry.name.trim())continue;
        // This page is for ongoing TV channels, not live sports events.
        if(Number(entry.always_live)!==1)continue;
        if(entry.status&&entry.status!=="live")continue;
        const name=entry.name.trim();
        const key=normalize(name);
        const bucket=grouped.get(key)||{name,entries:[],poster:null};
        bucket.entries.push(entry);
        if(!bucket.poster&&typeof entry.poster==="string"&&/^https:\/\//.test(entry.poster))bucket.poster=entry.poster;
        grouped.set(key,bucket);
      }
    }
    return [...grouped.values()].map(c=>({...c,sources:uniqueSources(c.entries)}))
      .filter(c=>c.sources.length)
      .sort((a,b)=>rank(a.name)-rank(b.name)||a.name.localeCompare(b.name));
  };
  let loading=null,loadedAt=0,channels=[],activeSources=[],activeIndex=0,overlay=null,iframe=null;
  function status(message){
    list.replaceChildren();
    const card=document.createElement("div");
    card.className="game-card";
    card.textContent=message;
    list.append(card);
  }
  function closePlayer(){
    if(iframe)iframe.src="about:blank";
    overlay?.remove();
    overlay=null;iframe=null;activeSources=[];
  }
  function openPlayer(channel){
    closePlayer();
    activeSources=channel.sources;
    activeIndex=0;
    overlay=document.createElement("div");
    overlay.id="video-container";
    overlay.style.cssText="position:fixed;inset:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.85);z-index:1000;opacity:1;transition:opacity .4s ease";
    const wrapper=document.createElement("div");
    wrapper.id="video-wrapper";
    wrapper.style.cssText="position:relative;width:75vw;height:75vh;max-width:1200px;max-height:800px;background:#000;border-radius:12px;box-shadow:0 4px 20px rgba(239,239,136,.3);overflow:hidden";
    const close=document.createElement("button");
    close.id="close-video-x";
    close.type="button";
    close.textContent="×";
    close.setAttribute("aria-label","Close player");
    close.style.cssText="position:absolute;top:10px;right:15px;color:#efef88;font-size:32px;font-weight:bold;cursor:pointer;z-index:250";
    close.onclick=closePlayer;
    iframe=document.createElement("iframe");
    iframe.id="video-iframe";
    iframe.title=channel.name+" Live TV";
    iframe.setAttribute("frameborder","0");
    iframe.setAttribute("allow","autoplay; fullscreen; encrypted-media; picture-in-picture");
    iframe.setAttribute("allowfullscreen","");
    iframe.referrerPolicy="no-referrer";
    iframe.style.cssText="width:100%;height:100%;border:none;display:block";
    // Use the SAME overlay toolbar class and player controls as live games.
    const toolbar=document.createElement("div");
    toolbar.className="provider-toolbar";
    const next=document.createElement("button");
    next.type="button";
    next.className="next-provider";
    const swap=document.createElement("span");
    swap.className="provider-swap-icon";
    swap.textContent="⇄";
    swap.setAttribute("aria-hidden","true");
    const label=document.createElement("span");
    const switchText=document.createElement("span");
    switchText.className="provider-switch-word";
    switchText.textContent="Switch";
    next.append(swap,label,switchText);
    const show=()=>{
      iframe.src=activeSources[activeIndex].url;
      label.textContent=activeSources[activeIndex].name;
      const single=activeSources.length<2;
      next.disabled=single;
      switchText.hidden=swap.hidden=single;
      next.setAttribute("aria-label",single?label.textContent:label.textContent+" · Switch source");
    };
    next.onclick=()=>{activeIndex=(activeIndex+1)%activeSources.length;show()};
    toolbar.append(next);
    wrapper.append(close,iframe,toolbar);
    overlay.append(wrapper);
    overlay.onclick=e=>{if(e.target===overlay)closePlayer()};
    document.body.append(overlay);
    show();
  }
  function render(){
    list.replaceChildren();
    if(!channels.length){status("No TV channels are currently listed.");return}
    for(const channel of channels){
      const card=document.createElement("div");
      card.className="game-card";
      const image=document.createElement("div");
      if(channel.poster){
        const img=document.createElement("img");
        img.src=channel.poster;img.alt="";img.loading="lazy";img.className="sg-tv-channel-art";
        image.append(img);
      }
      const title=document.createElement("div");
      title.className="sg-tv-channel-name";
      title.textContent=channel.name;
      const state=document.createElement("div");
      state.className="sg-tv-status";
      state.textContent="Status: Live";
      const sources=document.createElement("div");
      sources.className="sg-tv-source-count";
      sources.textContent=channel.sources.length+" available source"+(channel.sources.length===1?"":"s");
      const watch=document.createElement("button");
      watch.type="button";watch.className="watch-btn";watch.textContent="Watch Live";
      watch.onclick=()=>openPlayer(channel);
      card.append(image,title,state,sources,watch);
      list.append(card);
    }
  }
  async function refresh(){
    if(loading)return loading;
    loading=(async()=>{
      if(!channels.length)status("Loading live TV channels...");
      try{
        const response=await fetch("https://ondemand.st/papi/api/streams",{
          credentials:"omit",signal:AbortSignal.timeout(9000),cache:"no-store"
        });
        if(!response.ok)throw Error("TV listing unavailable");
        const data=await response.json();
        channels=channelsFrom(data);
        loadedAt=Date.now();
        render();
      }catch(error){
        if(!channels.length)status("Could not load TV channels. Switch tabs to try again.");
        console.warn("Live TV listing unavailable:",error);
      }
    })();
    try{await loading}finally{loading=null}
  }
  const switchTV=value=>{
    section.hidden=!value;
    sports.hidden=value;
    tvButton.classList.toggle("active",value);
    tvButton.setAttribute("aria-pressed",String(value));
    if(value){
      document.querySelectorAll(".sport-btn[data-sport]").forEach(button=>{
        button.classList.remove("active");
        button.setAttribute("aria-pressed","false");
      });
      if(Date.now()-loadedAt>60000)refresh();
    }else closePlayer();
  };
  tvButton.onclick=()=>switchTV(section.hidden);
  document.querySelectorAll(".sport-btn[data-sport]").forEach(button=>{
    button.addEventListener("click",()=>switchTV(false));
  });
  const collapse=()=>{
    const expanded=header.getAttribute("aria-expanded")!=="true";
    header.setAttribute("aria-expanded",String(expanded));
    list.hidden=!expanded;
    header.querySelector(".arrow").textContent=expanded?"▼":"▲";
  };
  header.onclick=collapse;
  header.onkeydown=e=>{
    if(e.key==="Enter"||e.key===" "){e.preventDefault();collapse()}
  };
  window.addEventListener("keydown",e=>{if(e.key==="Escape"&&overlay)closePlayer()});
})();
