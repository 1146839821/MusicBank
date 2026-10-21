/** Paginate measured Word blocks so every printed page retains the template margins. */
export function paginatePreview(host:HTMLElement){
  for(const section of Array.from(host.querySelectorAll<HTMLElement>('section.docx'))){
    const article=Array.from(section.children).find(child=>child.tagName==='ARTICLE') as HTMLElement|undefined
    if(!article)continue
    const style=getComputedStyle(section),pageHeight=parseFloat(style.minHeight),available=pageHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom)
    if(!Number.isFinite(available)||available<150)continue
    const blocks=Array.from(article.children),parent=section.parentElement
    if(!parent)continue
    let current=section,currentArticle=article
    const overflows=()=>currentArticle.getBoundingClientRect().height>available+1
    function nextPage(){
      const next=section.cloneNode(false) as HTMLElement,nextArticle=article!.cloneNode(false) as HTMLElement
      // Reuse the template's header/footer on continuation pages.
      for(const child of Array.from(section.children))if(child!==article&&['HEADER','FOOTER'].includes(child.tagName))next.appendChild(child.cloneNode(true))
      next.appendChild(nextArticle);parent!.insertBefore(next,current.nextSibling)
      current=next;currentArticle=nextArticle
    }
    function carryStem(block:Element){
      const previous=block.previousElementSibling as HTMLElement|null
      return previous&&(/^(?:[一二三四五六七八九十]+、|\d+\.\s)/.test(previous.textContent||'')||getComputedStyle(previous).breakAfter==='avoid')?previous:null
    }
    function splitTable(table:HTMLTableElement){
      const rows=Array.from(table.rows),rowParents=new Map(rows.map(row=>[row,row.parentElement!]))
      table.remove()
      let chunk:HTMLTableElement
      let groups:Map<Element,Element>
      function newChunk(){
        chunk=table.cloneNode(false) as HTMLTableElement
        // Preserve column widths and captions, while rebuilding row groups on each page.
        for(const child of Array.from(table.children))if(!['TR','TBODY','THEAD','TFOOT'].includes(child.tagName))chunk.appendChild(child.cloneNode(true))
        groups=new Map();currentArticle.appendChild(chunk)
      }
      function appendRow(row:HTMLTableRowElement){
        const source=rowParents.get(row)!
        if(source===table){chunk.appendChild(row);return}
        let group=groups.get(source)
        if(!group){group=source.cloneNode(false) as Element;groups.set(source,group);chunk.appendChild(group)}
        group.appendChild(row)
      }
      newChunk()
      for(const row of rows){
        appendRow(row)
        if(!overflows())continue
        if(chunk!.rows.length>1){
          row.remove();nextPage();newChunk();appendRow(row)
        }else if(currentArticle.children.length>1){
          const carry=carryStem(chunk!)
          chunk!.remove();carry?.remove();nextPage()
          if(carry)currentArticle.appendChild(carry)
          currentArticle.appendChild(chunk!)
        }
        // A single row taller than the page cannot be split without cutting an image.
      }
    }
    article.replaceChildren()
    for(const block of blocks){
      currentArticle.appendChild(block)
      if(block.tagName==='TABLE'&&block.getBoundingClientRect().height>available+1){splitTable(block as HTMLTableElement);continue}
      if(!overflows()||currentArticle.children.length===1)continue
      const carry=carryStem(block)
      block.remove();carry?.remove();nextPage()
      if(carry)currentArticle.appendChild(carry)
      currentArticle.appendChild(block)
    }
  }
}
