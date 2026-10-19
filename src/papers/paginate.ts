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
    article.replaceChildren()
    for(const block of blocks){
      currentArticle.appendChild(block)
      if(currentArticle.getBoundingClientRect().height<=available+1||currentArticle.children.length===1)continue
      const previous=block.previousElementSibling as HTMLElement|null
      const carry=previous&&(/^(?:[一二三四五六七八九十]+、|\d+\.\s)/.test(previous.textContent||'')||getComputedStyle(previous).breakAfter==='avoid')?previous:null
      block.remove();carry?.remove()
      const next=section.cloneNode(false) as HTMLElement,nextArticle=article.cloneNode(false) as HTMLElement
      // Reuse the template's header/footer on continuation pages.
      for(const child of Array.from(section.children))if(child!==article&&['HEADER','FOOTER'].includes(child.tagName))next.appendChild(child.cloneNode(true))
      next.appendChild(nextArticle);parent.insertBefore(next,current.nextSibling)
      if(carry)nextArticle.appendChild(carry)
      nextArticle.appendChild(block);current=next;currentArticle=nextArticle
    }
  }
}
