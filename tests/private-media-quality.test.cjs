const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const appSource=fs.readFileSync('app/src/main/assets/app.js','utf8');
const lensSource=fs.readFileSync('app/src/main/assets/lens.js','utf8');
const html=fs.readFileSync('app/src/main/assets/index.html','utf8');

test('camera kill switch exists in PIN-only call pane and never starts camera directly',()=>{
  assert.match(html,/<button id="stopVideo"[^>]*hidden>Kameramı kapat, ses devam etsin<\/button>/);
  assert.ok(html.indexOf('id="stopVideo"')>html.indexOf('id="privateView"'));
  assert.match(appSource,/if \(!stream \|\| state === 'idle' \|\| paused/);
  assert.match(appSource,/track\.enabled = false; track\.stop\(\)/);
});

function draftHarness(items) {
  const from=lensSource.indexOf('  function resetDraftEditor() {');
  const to=lensSource.indexOf('  function renderContacts() {',from);
  assert.ok(from>0&&to>from);
  const elements={};
  class El {
    constructor(){this.children=[];this.events={};this.textContent='';this.value='';this.hidden=false;}
    replaceChildren(...items){this.children=items;}
    append(...items){this.children.push(...items);}
    addEventListener(type,fn){this.events[type]=fn;}
    focus(){this.focused=true;}
  }
  const doc={hidden:false,createElement(){return new El();}};
  const $=id=>elements[id]||(elements[id]=new El());
  const vault={data:{messages:items.map(x=>({...x}))}};
  let opened=true;
  const context={document:doc,$,vault,opened,editingDraftId:null,window:{crypto:null},
    persist(action){action(vault.data);return Promise.resolve(true);}};
  vm.runInNewContext(lensSource.slice(from,to)+'\nthis.renderDrafts=renderDrafts;this.resetDraftEditor=resetDraftEditor;',context);
  return {context,$,vault,render:()=>context.renderDrafts(),setUnlocked:v=>{context.opened=v;}};
}
const drafts=[
  {id:'a'.repeat(32),peer:'654321',text:'Selam <script>alert(1)</script>',createdAt:500},
  {id:'b'.repeat(32),peer:'123456',text:'Randevu notları',createdAt:1000}
];
test('PIN drafts are sorted, escaped, and searchable without changing ciphertext data',()=>{
  const h=draftHarness(drafts);h.render();
  assert.equal(h.$('draftCount').textContent,'2 / 2 şifreli taslak');
  assert.equal(h.$('draftList').children[0].children[0].textContent,'Kod: 123456');
  assert.equal(h.$('draftList').children[1].children[1].textContent,'Selam <script>alert(1)</script>');
  h.$('draftSearch').value='654';
  h.render();
  assert.equal(h.$('draftList').children.length,1);
  assert.equal(h.$('draftCount').textContent,'1 / 2 şifreli taslak');
  assert.equal(h.vault.data.messages.length,2);
  h.$('draftSearch').value='selam';
  h.render();
  assert.equal(h.$('draftList').children.length,1);
});
test('existing encrypted drafts can be edited without creating duplicates or exposing a clipboard',()=>{
  const h=draftHarness(drafts);h.render();
  const row=h.$('draftList').children[0];
  row.children[2].events.click();
  assert.equal(h.context.editingDraftId,drafts[1].id);
  assert.equal(h.$('draftPeer').value,'123456');
  assert.equal(h.$('draftText').value,'Randevu notları');
  assert.equal(h.$('cancelDraftEdit').hidden,false);
  assert.ok(!lensSource.includes('navigator.clipboard'));
  h.context.resetDraftEditor();
  assert.equal(h.context.editingDraftId,null);
  assert.equal(h.$('draftText').value,'');
});
test('delete is blocked on locked/hidden pages and resets edit identity',async()=>{
  const h=draftHarness(drafts);h.render();
  const row=h.$('draftList').children[0], edit=row.children[2], remove=row.children[3];
  edit.events.click();
  h.context.document.hidden=true;
  remove.events.click();
  assert.equal(h.vault.data.messages.length,2);
  h.context.document.hidden=false;
  remove.events.click();await Promise.resolve();
  assert.equal(h.vault.data.messages.length,1);
  assert.equal(h.context.editingDraftId,null);
});
test('locking private area clears search, editor, PIN draft DOM and ciphertext keys',()=>{
  assert.match(lensSource,/\$\('draftPeer'\)\.value=\$\('draftText'\)\.value=\$\('draftSearch'\)\.value=''/);
  assert.match(lensSource,/editingDraftId=null;\$\('saveDraft'\)\.textContent='Şifreli taslak kaydet'/);
  assert.match(lensSource,/if\(vault\)vault\.lock\(\)/);
  assert.match(lensSource,/\$\('contactList'\)\.replaceChildren\(\);\$\('draftList'\)\.replaceChildren\(\)/);
});
