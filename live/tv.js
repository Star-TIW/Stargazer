(() => {
  "use strict";
  const tvButton = document.getElementById("sg-tv-tab");
  const tv = document.getElementById("sg-tv");
  const grid = document.getElementById("sg-tv-grid");
  const sports = document.querySelector(".live-scroll-container");
  if (!tvButton || !tv || !grid || !sports) return;
  const channels = [
    {name:"ABC",group:"Major Networks",url:"https://abc.com/",description:"ABC shows and network programming"},
    {name:"CBS",group:"Major Networks",url:"https://www.cbs.com/",description:"CBS shows and network programming"},
    {name:"NBC",group:"Major Networks",url:"https://www.nbc.com/",description:"NBC shows and network programming"},
    {name:"FOX",group:"Major Networks",url:"https://www.fox.com/",description:"FOX shows and network programming"},
    {name:"PBS",group:"Major Networks",url:"https://www.pbs.org/livestream/",description:"Local PBS live TV, where available"},
    {name:"The CW",group:"Major Networks",url:"https://www.cwtv.com/",description:"CW programming"},
    {name:"ABC News Live",group:"Free Live News",url:"https://abcnews.go.com/Live",description:"Free live news"},
    {name:"CBS News 24/7",group:"Free Live News",url:"https://www.cbsnews.com/live/",description:"Free live news"},
    {name:"NBC News NOW",group:"Free Live News",url:"https://www.nbcnews.com/now",description:"Free live news"},
    {name:"PBS News",group:"Free Live News",url:"https://www.pbs.org/newshour/",description:"News and current affairs"},
    {name:"Pluto TV",group:"Free TV",url:"https://pluto.tv/",description:"Free live channels"},
    {name:"Plex Live TV",group:"Free TV",url:"https://watch.plex.tv/live-tv",description:"Free live TV channels"},
    {name:"Tubi",group:"Free TV",url:"https://tubitv.com/live",description:"Free live TV, where available"}
  ];
  let open = false;
  const render = () => {
    grid.replaceChildren();
    for (const channel of channels) {
      const link = document.createElement("a");
      link.className = "sg-tv-card";
      link.href = channel.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      const group = document.createElement("small");
      group.textContent = channel.group;
      const title = document.createElement("strong");
      title.textContent = channel.name;
      const description = document.createElement("span");
      description.textContent = channel.description;
      const action = document.createElement("em");
      action.textContent = "Open official site ↗";
      link.append(group,title,description,action);
      grid.append(link);
    }
  };
  const setTV = value => {
    open = value;
    tv.hidden = !value;
    sports.hidden = value;
    tvButton.classList.toggle("active",value);
    tvButton.setAttribute("aria-pressed",String(value));
    if (value) {
      document.querySelectorAll(".sport-btn[data-sport]").forEach(button => {
        button.classList.remove("active");
        button.setAttribute("aria-pressed","false");
      });
    }
  };
  tvButton.addEventListener("click", () => setTV(!open));
  document.querySelectorAll(".sport-btn[data-sport]").forEach(button => {
    button.addEventListener("click", () => setTV(false));
  });
  render();
})();