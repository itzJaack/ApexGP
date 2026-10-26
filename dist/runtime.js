const freedBikes=new WeakSet(),freedWorlds=new WeakSet();
export function disposeBike(renderer,bike){
 if(!bike||freedBikes.has(bike))return;freedBikes.add(bike);
 const meshes=[bike.mesh,bike.rider,bike.glass,bike.steering,bike.shadow,...(bike.wheels||[]).map(p=>p.mesh),...(bike.decals||[]).map(p=>p.mesh),...(bike.riderDecals||[]).map(p=>p.mesh)];
 for(const mesh of new Set(meshes))if(mesh)renderer.destroy(mesh);
 for(const texture of new Set(bike.textures||[]))if(texture)renderer.gl?.deleteTexture(texture);
}
export function disposeWorld(renderer,world){
 if(!world||freedWorlds.has(world))return;freedWorlds.add(world);
 for(const mesh of new Set([world.mesh,world.line,...(world.boards||[]).map(p=>p.mesh),...Object.values(world.flagMeshes||{})]))if(mesh)renderer.destroy(mesh);
 for(const texture of new Set(world.textures||[]))if(texture)renderer.gl?.deleteTexture(texture);
}
// A failed model/world build must release its partial allocations immediately.
export function allocateScene(renderer,build){
 const meshes=[],textures=[],scope=Object.create(renderer);
 scope.mesh=data=>{const mesh=renderer.mesh(data);meshes.push(mesh);return mesh;};
 scope.texture=image=>{const texture=renderer.texture(image);textures.push(texture);return texture;};
 try{return build(scope);}catch(error){
  for(const mesh of new Set(meshes))renderer.destroy?.(mesh);
  for(const texture of new Set(textures))if(texture)renderer.gl?.deleteTexture(texture);
  throw error;
 }
}
export class AssetTransition{
 constructor(onChange=()=>{}){this.pending=null;this.onChange=onChange;}
 get busy(){return !!this.pending;}
 run(work){
  if(this.pending)return this.pending;
  const task=Promise.resolve().then(work).finally(()=>{if(this.pending===task){this.pending=null;this.onChange(false);}});
  this.pending=task;this.onChange(true);return task;
 }
}
