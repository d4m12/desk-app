(function (global) {
  function dpr(ctx, canvas) {
    const r = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = Math.max(1, Math.floor(w * r));
    canvas.height = Math.max(1, Math.floor(h * r));
    ctx.setTransform(r, 0, 0, r, 0, 0);
    return { w, h };
  }

  function lineChart(canvas, { points, startValue, marks, color }) {
    const ctx = canvas.getContext("2d");
    const { w, h } = dpr(ctx, canvas);
    ctx.clearRect(0, 0, w, h);
    if (!points || !points.length) {
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = "rgba(232,121,249,0.35)";
      ctx.beginPath();
      const y = h * 0.55;
      ctx.moveTo(8, y); ctx.lineTo(w - 8, y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(245,169,255,0.7)";
      ctx.font = "14px -apple-system, sans-serif";
      ctx.fillText("En attente du premier trade", 12, y - 12);
      return;
    }
    const vals = points.map((p) => p.v);
    if (startValue != null) vals.push(startValue);
    let min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
    if (min === max) { min -= 1; max += 1; }
    const pad = 8;
    const ys = (v) => pad + (1 - (v - min) / (max - min)) * (h - pad * 2);
    const xs = (i) => pad + (i / Math.max(points.length - 1, 1)) * (w - pad * 2);
    if (startValue != null) {
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = "rgba(232,121,249,0.4)";
      ctx.beginPath();
      const y0 = ys(startValue);
      ctx.moveTo(pad, y0); ctx.lineTo(w - pad, y0); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.beginPath();
    points.forEach((p, i) => {
      const x = xs(i), y = ys(p.v);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = color || "#ff4ecd";
    ctx.lineWidth = 2;
    ctx.stroke();
    const last = points[points.length - 1];
    ctx.lineTo(xs(points.length - 1), h);
    ctx.lineTo(xs(0), h);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "rgba(255,45,149,0.38)");
    g.addColorStop(1, "rgba(124,58,237,0)");
    ctx.fillStyle = g;
    ctx.fill();
    if (marks && marks.length) {
      let row = 0;
      marks.forEach((m, i) => {
        const idx = Math.min(points.length - 1, Math.round((i / marks.length) * (points.length - 1)));
        const x = xs(idx);
        const y = ys(points[idx].v) - 10 - (row % 3) * 12;
        ctx.fillStyle = m.kind === "bought" ? "#c084fc" : (m.kind === "stopped" ? "#ff453a" : "#ff4ecd");
        ctx.font = "11px -apple-system, sans-serif";
        ctx.fillText(m.title || m.value || m.kind, x, y);
        row++;
      });
    }
  }

  function candles(canvas, rows) {
    const ctx = canvas.getContext("2d");
    const { w, h } = dpr(ctx, canvas);
    ctx.clearRect(0, 0, w, h);
    if (!rows || !rows.length) {
      ctx.fillStyle = "rgba(245,169,255,0.7)";
      ctx.font = "14px -apple-system, sans-serif";
      ctx.fillText("Pas encore de prix enregistré", 12, h / 2);
      return;
    }
    const highs = rows.map((r) => r.h), lows = rows.map((r) => r.l);
    let min = Math.min.apply(null, lows), max = Math.max.apply(null, highs);
    if (min === max) { min -= 1; max += 1; }
    const volH = 36;
    const chartH = h - volH - 8;
    const ys = (v) => 8 + (1 - (v - min) / (max - min)) * (chartH - 16);
    const bw = Math.max(2, (w - 16) / rows.length - 2);
    const maxV = Math.max.apply(null, rows.map((r) => r.v || 0)) || 1;
    rows.forEach((r, i) => {
      const x = 8 + i * ((w - 16) / rows.length);
      const up = r.c >= r.o;
      ctx.strokeStyle = ctx.fillStyle = up ? "#e879f9" : "#ff2d6a";
      ctx.beginPath();
      ctx.moveTo(x + bw / 2, ys(r.h));
      ctx.lineTo(x + bw / 2, ys(r.l));
      ctx.stroke();
      const y1 = ys(Math.max(r.o, r.c)), y2 = ys(Math.min(r.o, r.c));
      ctx.fillRect(x, y1, bw, Math.max(1, y2 - y1));
      const vh = ((r.v || 0) / maxV) * (volH - 4);
      ctx.globalAlpha = 0.55;
      ctx.fillRect(x, h - vh, bw, vh);
      ctx.globalAlpha = 1;
    });
  }

  function scoreRing(canvas, score, threshold) {
    const ctx = canvas.getContext("2d");
    const { w, h } = dpr(ctx, canvas);
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2, rad = Math.min(w, h) / 2 - 8;
    ctx.lineWidth = 8;
    ctx.strokeStyle = "#2a1038";
    ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.stroke();
    const pct = Math.max(0, Math.min(100, score || 0)) / 100;
    ctx.strokeStyle = (score || 0) >= (threshold || 70) ? "#ff4ecd" : "#c084fc";
    ctx.beginPath();
    ctx.arc(cx, cy, rad, -Math.PI / 2, -Math.PI / 2 + pct * Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = "600 28px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(score ?? "–"), cx, cy);
  }

  function positionChart(canvas, { points, stops, entry, position }) {
    const ctx=canvas.getContext("2d"),{w,h}=dpr(ctx,canvas);
    ctx.clearRect(0,0,w,h);
    const left=8,right=Math.max(48,w-48),top=20,bottom=26;
    if(!points||!points.length){
      ctx.fillStyle="rgba(242,220,255,.6)";ctx.font="12px -apple-system, sans-serif";
      ctx.fillText("Historique de prix indisponible",left,h/2);return;
    }
    const first=Date.parse(points[0].ts)||0,last=Date.parse(points[points.length-1].ts)||first+1;
    const firstStop=Date.parse(stops[0]&&stops[0].ts)||first;
    const start=Math.min(first,firstStop,Date.parse(position.opened_at)||first);
    const end=Math.max(last,Date.parse(position.closed_at)||last,start+1);
    const xs=(ts)=>left+(Date.parse(ts)-start)/(end-start)*(right-left);
    let all=points.map(p=>Number(p.price)).concat(stops.map(s=>Number(s.stop)),[Number(entry),Number(position.peak_price)]);
    all=all.filter(n=>Number.isFinite(n)&&n>0);
    let min=Math.min(...all),max=Math.max(...all);
    if(min===max){min*=0.95;max*=1.05;}
    const range=max-min;min=Math.max(0,min-range*.12);max+=range*.16;
    const ys=v=>top+(max-v)/(max-min)*(h-top-bottom);
    function horizontal(value,color,dash,label){
      if(!Number.isFinite(Number(value))||value<=0)return;
      const y=ys(Number(value));ctx.setLineDash(dash);ctx.strokeStyle=color;ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();ctx.setLineDash([]);
      ctx.fillStyle=color;ctx.font="10px -apple-system, sans-serif";ctx.fillText(label,right+5,y+3);
    }
    horizontal(entry,"rgba(180,139,255,.9)",[5,5],"Entrée");
    if(stops.length){ctx.strokeStyle="#ffbe5c";ctx.lineWidth=1.5;ctx.setLineDash([4,3]);ctx.beginPath();
      stops.forEach((s,i)=>{const x=xs(s.ts),y=ys(Number(s.stop));if(i===0)ctx.moveTo(x,y);else{ctx.lineTo(x,y);ctx.lineTo(x,y);}ctx.lineTo(x,y);});ctx.stroke();ctx.setLineDash([]);}
    ctx.strokeStyle="#ff4ecd";ctx.lineWidth=2.5;ctx.shadowColor="#ff2d95";ctx.shadowBlur=10;ctx.beginPath();
    points.forEach((p,i)=>{const x=xs(p.ts),y=ys(Number(p.price));if(!i)ctx.moveTo(x,y);else ctx.lineTo(x,y);});ctx.stroke();ctx.shadowBlur=0;
    function marker(ts,price,color,label){const x=xs(ts),y=ys(price);ctx.fillStyle=color;ctx.strokeStyle="#11051b";ctx.lineWidth=2;
      ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.font="10px -apple-system, sans-serif";ctx.fillText(label,Math.max(2,x-16),Math.max(11,y-10));}
    marker(points[0].ts,points[0].price,"#b48bff","ACHAT");
    if(position.closed_at&&position.exit_price!=null){const x=xs(position.closed_at);ctx.strokeStyle="#ff687c";ctx.setLineDash([2,4]);
      ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,h-bottom);ctx.stroke();ctx.setLineDash([]);marker(position.closed_at,position.exit_price,"#ff687c","SORTIE");}
    ctx.fillStyle="rgba(242,220,255,.5)";ctx.font="10px -apple-system, sans-serif";
    const a=new Date(start).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"}),b=new Date(end).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"});
    ctx.fillText(a,left,h-5);const bw=ctx.measureText(b).width;ctx.fillText(b,right-bw,h-5);
  }

  global.DeskCharts = { lineChart, candles, scoreRing, positionChart };
})(window);
