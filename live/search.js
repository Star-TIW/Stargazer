(() => {
  "use strict";
  const input=document.getElementById("sg-stream-query");
  const reload=document.getElementById("sg-stream-reload");
  if(!input||!reload)return;
  const apply=()=>{
    const q=input.value.trim().toLocaleLowerCase();
    document.querySelectorAll("#sg-tv-live-list .sg-tv-card, #today-games .game-card, #upcoming-games .game-card").forEach(card=>{
      const title=card.querySelector(".sg-tv-channel-name, .teams")?.textContent||card.textContent||"";
      card.hidden=!!q&&!title.toLocaleLowerCase().includes(q);
    });
    window.dispatchEvent(new CustomEvent("stargazer:stream-search",{detail:{query:q}}));
  };
  input.addEventListener("input",apply);
  window.addEventListener("stargazer:tv-channels",()=>queueMicrotask(apply));
  const watch=new MutationObserver(()=>{if(input.value)apply()});
  for(const id of ["today-games","upcoming-games"]){
    const node=document.getElementById(id);
    if(node)watch.observe(node,{childList:true});
  }
  reload.onclick=()=>{
    reload.classList.remove("sg-spinning");
    void reload.offsetWidth;
    reload.classList.add("sg-spinning");
    const tv=document.getElementById("sg-tv");
    if(tv&&!tv.hidden)window.dispatchEvent(new Event("stargazer:tv-reload"));
    else window.dispatchEvent(new Event("stargazer:sports-reload"));
  };
  apply();
})();
