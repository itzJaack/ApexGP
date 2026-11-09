// Cached Copernicus heights are interpolated continuously in the same local
// coordinate system as the mapped circuit. Zero is the finish-line altitude.
export function terrainElevation(config,x,z){
 const grid=config.terrainGrid;if(!grid)return 0;
 const u=Math.max(0,Math.min(grid.width-1,(x-grid.x)/grid.step)),v=Math.max(0,Math.min(grid.depth-1,(z-grid.z)/grid.step));
 const i=Math.min(grid.width-2,Math.floor(u)),j=Math.min(grid.depth-2,Math.floor(v)),a=u-i,b=v-j;
 const at=(x,z)=>grid.elevations[z*grid.width+x];
 return(at(i,j)*(1-a)+at(i+1,j)*a)*(1-b)+(at(i,j+1)*(1-a)+at(i+1,j+1)*a)*b-(grid.baseElevation||0);
}

// The 30 m surface model also contains vegetation and structures. Fit a smooth
// closed road profile rather than sending those raster steps into the bike.
export function fitRoadElevations(config,nodes,step){
 const raw=nodes.map(n=>terrainElevation(config,n.x,n.z)),count=raw.length,span=Math.ceil(75/step),weights=[];
 for(let i=-span;i<=span;i++)weights.push(Math.exp(-.5*(i*step/25)**2));
 const total=weights.reduce((s,v)=>s+v,0),heights=raw.map((_,i)=>weights.reduce((sum,w,k)=>sum+w*raw[(i+k-span+count)%count],0)/total);
 const change=.18*step;
 for(let pass=0;pass<2;pass++){
  for(let i=0;i<count*2;i++){const at=i%count,previous=(at+count-1)%count;heights[at]=Math.min(heights[at],heights[previous]+change);}
  for(let i=count*2-1;i>=0;i--){const at=i%count,next=(at+1)%count;heights[at]=Math.min(heights[at],heights[next]+change);}
 }
 const offset=heights[0];
 return{offset,heights:heights.map(h=>h-offset)};
}
