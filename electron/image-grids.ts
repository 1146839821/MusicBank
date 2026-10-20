import type {ImageGridBlock} from './types.js'
export function validateImageGrids(grids:ImageGridBlock[]|undefined){
  if(grids===undefined)return
  const ids=new Set<string>()
  const id=(value:unknown)=>{if(typeof value!=='string'||!/^[-\w]{1,100}$/.test(value)||ids.has(value))throw new Error('图文网格 ID 无效或重复');ids.add(value)}
  if(!Array.isArray(grids)||grids.length>20)throw new Error('图文网格数量无效')
  for(const grid of grids){
    if(!grid||grid.kind!=='image-grid'||![2,3,4].includes(grid.columns)||!Number.isFinite(grid.imageHeight)||grid.imageHeight<60||grid.imageHeight>400||!Number.isFinite(grid.gap)||grid.gap<0||grid.gap>48||!['contain','cover'].includes(grid.fit)||!['start','center','end'].includes(grid.align)||!Array.isArray(grid.items)||grid.items.length>40)throw new Error('图文网格布局无效')
    id(grid.id)
    for(const item of grid.items){id(item.id);if(typeof item.assetId!=='string'||!/^[-\w]{1,100}$/.test(item.assetId)||typeof item.caption!=='string'||item.caption.length>2000)throw new Error('图文网格图片或说明无效')}
  }
}
