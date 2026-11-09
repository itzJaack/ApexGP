const bounds=ring=>({minX:Math.min(...ring.map(p=>p[0])),maxX:Math.max(...ring.map(p=>p[0])),minZ:Math.min(...ring.map(p=>p[1])),maxZ:Math.max(...ring.map(p=>p[1]))});
function clipPolygon(polygon,distance){
 const out=[];
 for(let i=0;i<polygon.length;i++){
  const a=polygon[(i+polygon.length-1)%polygon.length],b=polygon[i],da=distance(a),db=distance(b);
  if((da<0)!==(db<0)){const t=da/(da-db);out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}
  if(db>=0)out.push(b);
 }
 return out;
}
// Cut every surface to the same grid and diagonal as the ground underneath.
// Independent large triangles previously intersected and flickered on slopes.
export function groundPatch(g,triangle,terrain,color,surface,lift=.025){
 if(terrain.bounds){
  const b=terrain.bounds;
  for(const edge of[p=>p[0]-b.minX,p=>b.maxX-p[0],p=>p[1]-b.minZ,p=>b.maxZ-p[1]])triangle=clipPolygon(triangle,edge);
  if(triangle.length<3)return;
 }
 const step=terrain.cellStep||12,b=bounds(triangle);
 for(let x=Math.floor(b.minX/step)*step;x<b.maxX;x+=step)for(let z=Math.floor(b.minZ/step)*step;z<b.maxZ;z+=step){
  let polygon=triangle;
  for(const edge of[p=>p[0]-x,p=>x+step-p[0],p=>p[1]-z,p=>z+step-p[1]])polygon=clipPolygon(polygon,edge);
  if(polygon.length<3)continue;
  for(const sign of[-1,1]){
   const half=clipPolygon(polygon,p=>sign*((p[0]-x)-(p[1]-z)));
   const point=([X,Z])=>[X,terrain(X,Z)+lift,Z];
   for(let i=1;i<half.length-1;i++){
    const a=half[0],b=half[i],c=half[i+1];
    if(Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))>1e-7)g.tri(point(c),point(b),point(a),color,surface);
   }
  }
 }
}
