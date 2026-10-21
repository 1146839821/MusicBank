import {beforeEach,describe,expect,it,vi} from 'vitest'
const mocks=vi.hoisted(()=>({create:vi.fn(),window:vi.fn(),destroy:vi.fn(),execute:vi.fn(),load:vi.fn()}))
vi.mock('electron',()=>({nativeImage:{createFromBuffer:mocks.create},BrowserWindow:class{webContents={session:{setPermissionRequestHandler:vi.fn(),webRequest:{onBeforeRequest:vi.fn()}},setWindowOpenHandler:vi.fn(),executeJavaScript:mocks.execute};loadURL=mocks.load;destroy=mocks.destroy;constructor(options:unknown){mocks.window(options)}}}))
import {documentImage} from '../electron/document-images'
beforeEach(()=>{vi.clearAllMocks();mocks.create.mockReturnValue({isEmpty:()=>true});mocks.load.mockResolvedValue(undefined)})
describe('document image conversion',()=>{
 it('keeps the native PNG/JPEG path without opening a conversion window',async()=>{
  mocks.create.mockReturnValue({isEmpty:()=>false,toPNG:()=>Buffer.from('png'),getSize:()=>({width:120,height:80})})
  expect(await documentImage(new Uint8Array([1]))).toEqual({bytes:Buffer.from('png'),width:120,height:80})
  expect(mocks.window).not.toHaveBeenCalled()
 })
 it('converts browser-decoded images to PNG and closes its isolated window',async()=>{
  mocks.execute.mockResolvedValue({width:120,height:80,png:'data:image/png;base64,AQID'})
  expect(await documentImage(new Uint8Array([4,5]))).toEqual({width:120,height:80,bytes:Buffer.from([1,2,3])})
  expect(mocks.window).toHaveBeenCalledWith(expect.objectContaining({show:false,webPreferences:expect.objectContaining({sandbox:true,nodeIntegration:false,contextIsolation:true})}))
  expect(mocks.destroy).toHaveBeenCalledOnce()
 })
 it('fails clearly and destroys the window when decoding fails',async()=>{
  mocks.execute.mockRejectedValue(new Error('Invalid image'))
  await expect(documentImage(new Uint8Array([0]))).rejects.toThrow('无法识别或转换')
  expect(mocks.destroy).toHaveBeenCalledOnce()
 })
 it.each([{width:0,height:80,png:'data:image/png;base64,AQID'},{width:120,height:80,png:'file:///private.png'},{width:100000,height:100000,png:'data:image/png;base64,AQID'}])('rejects invalid conversion results',async result=>{
  mocks.execute.mockResolvedValue(result)
  await expect(documentImage(new Uint8Array([0]))).rejects.toThrow('无法识别或转换')
  expect(mocks.destroy).toHaveBeenCalledOnce()
 })
})
