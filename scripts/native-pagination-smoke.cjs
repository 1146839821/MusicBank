// Measure the real Chromium layout; DOM mocks cannot validate printed page heights.
const {app,BrowserWindow}=require('electron');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const ts=require('typescript');
const deadline=setTimeout(()=>{console.error('Pagination smoke test timed out');app.exit(1)},20000);
app.on('window-all-closed',()=>{});
app.whenReady().then(async()=>{
 const compiled=ts.transpileModule(readFileSync(join(process.cwd(),'src/papers/paginate.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const window=new BrowserWindow({show:false,webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true}});
 try{
  await window.loadURL('data:text/html,<html><body></body></html>');
  const result=await window.webContents.executeJavaScript(`(()=>{
   const exports={};${compiled}
   document.head.innerHTML='<style>body{margin:0}section.docx{min-height:500px;width:500px;padding:50px;box-sizing:border-box}article{width:400px}table{border-collapse:collapse;width:400px}td{padding:0;height:120px}p{margin:0;height:40px}header,footer{height:10px}</style>';
   function fixture(rows,prefix=''){
    document.body.innerHTML='<div><section class="docx"><header>页眉</header><article>'+prefix+'<p>1. 请观察图片</p><table><colgroup><col style="width:100px"><col style="width:100px"><col style="width:100px"><col style="width:100px"></colgroup><tbody>'+Array.from({length:rows},(_,i)=>'<tr>'+Array.from({length:4},(_,j)=>'<td>图片 '+(i*4+j+1)+'</td>').join('')+'</tr>').join('')+'</tbody></table><p>下一题</p></article><footer>页脚</footer></section></div>';
   }
   fixture(10);exports.paginatePreview(document.body);
   const pages=[...document.querySelectorAll('section.docx')];
   if(pages.length<4)throw Error('Forty-image table did not paginate');
   for(const page of pages){if(page.querySelector('article').getBoundingClientRect().height>401)throw Error('Page overflow');if(!page.querySelector('header')||!page.querySelector('footer'))throw Error('Lost template margins/header/footer')}
   const cells=[...document.querySelectorAll('td')].map(cell=>cell.textContent);
   if(cells.length!==40||cells.some((text,index)=>text!=='图片 '+(index+1)))throw Error('Images lost or reordered');
   if([...document.querySelectorAll('table')].some(table=>table.querySelectorAll('col').length!==4))throw Error('Column widths lost');
   const largePages=pages.length;
   fixture(2,'<p style="height:240px">前题留白</p>');exports.paginatePreview(document.body);
   const tables=[...document.querySelectorAll('table')];
   if(tables.length!==1||tables[0].rows.length!==2)throw Error('Fitting matching table was split');
   if(tables[0].previousElementSibling?.textContent!=='1. 请观察图片')throw Error('Question heading separated');
   return {largeGridPages:largePages,imageCount:cells.length,shortTableRows:tables[0].rows.length};
  })()`);
  console.log('musicbank-pagination-ok',JSON.stringify(result));
 }finally{window.destroy()}
 clearTimeout(deadline);app.quit();
}).catch(error=>{console.error(error);app.exit(1)});
