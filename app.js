// My Exams – كامل السكربت بعد إصلاح حفظ التاريخ على Appwrite
// ============================================================
// ملاحظة: انسخ هذا الملف كما هو (أو ما بداخله) مكان السكربت القديم
//         وسيُحَلّ مشكل عدم حفظ التعديلات نهائياً.

const { Client, Databases, Account, ID } = Appwrite;
const client = new Client()
  .setEndpoint('https://fra.cloud.appwrite.io/v1')
  .setProject('66cf3db2002471686c6f');
const account   = new Account(client);
const databases = new Databases(client);
const databaseId   = '68136c4cee33221deb0f';
const collectionId = 'tasks';

// عناصر DOM
const $            = id => document.getElementById(id);
const adminPass    = $('adminPass');
const addBtn       = $('addBtn');
const refreshBtn   = $('refreshBtn');
const loginBox     = $('loginBox');
const taskForm     = $('taskForm');
const summaryBox   = $('summaryBox');
const tableBodyEl  = $('tableBody');
const totalCostEl  = $('totalCost');
const offlineBadge = $('offlineBadge');
const priorityFlag = $('priorityFlag');
const sessionNumber= $('sessionNumber');
const teacherName  = $('teacherName');
const recordDateTime = $('recordDateTime');
const recordRoom   = $('recordRoom');

// كلمات المرور والأدوار
const PASSWORDS = {
  admin: 'Admin12',
  accountant: 'account123',
  coordinator: 'design123',
  entry: 'entry123',
  cameraman: 'photo123',
  montage: 'edit123',
  media: 'social123',
  marketing: 'market123'
};
let currentRole = 'guest';
const roleCols = {
  admin: 'all',
  accountant: 'all',
  coordinator: [0,1,2,3,4,7,25],
  entry: [0,1,2,7,8,11,12,18,19],
  cameraman: [0,1,2,13,14],
  montage: [0,1,2,13,16,17],
  media: [0,1,2,7,11,18],
  marketing: [22]
};
const editableByRole = {
  coordinator: [3,4,7],
  entry: [7,8,11,12,18,19],
  montage: [16,17],
  media: [7,11,18],
  marketing: [22]
};

/*───────────────────────────────
 |  تسجيل الدخول
 *──────────────────────────────*/
function checkLogin() {
  const pass = adminPass.value.trim();
  for (const [role, pwd] of Object.entries(PASSWORDS)) {
    if (pass === pwd) { currentRole = role; break; }
  }
  if (currentRole === 'guest') {
    return alert('كلمة المرور غير صحيحة');
  }

  loginBox.style.display   = 'none';
  taskForm.style.display   = currentRole === 'admin' ? 'grid' : 'none';
  addBtn.style.display     = currentRole === 'admin' ? 'inline-block' : 'none';
  summaryBox.style.display = 'flex';
  refreshBtn.style.display = 'inline-block';

  account.get()
    .then(loadFromAppwrite)
    .catch(() => account.createAnonymousSession()
                        .then(loadFromAppwrite)
                        .catch(console.error));

  // ping كل 10 ثوانٍ للإبقاء على الاشتراك الحي
  setInterval(() =>
    databases.listDocuments(databaseId, collectionId, [], 1, 0).catch(() => {}),
    10000
  );
}

/*───────────────────────────────
 |  إضافة محاضرة جديدة
 *──────────────────────────────*/
addBtn.addEventListener('click', async () => {
  const priority = priorityFlag.checked ? '✅' : '❌';
  const lecture  = sessionNumber.value.trim();
  const teacher  = teacherName.value.trim();
  const dateTime = recordDateTime.value;

  if (!lecture || !teacher || !dateTime) {
    return alert('الرجاء ملء جميع الحقول');
  }

  const payload = {
    priority,
    lectureNumber: lecture,
    teacherName : teacher,
    recordDate  : new Date(dateTime).toISOString(),
    recordRoom  : recordRoom.value,
    mainCells   : Array(10).fill(''),
    cellColors  : Array(10).fill(''),
    costs       : Array(10).fill(''),
    totalCost   : ''
  };

  try {
    const doc = await databases.createDocument(databaseId, collectionId, ID.unique(), payload);
    addLectureRow(priority, lecture, teacher, dateTime, recordRoom.value, true, doc.$id);
    taskForm.reset();
    sortTable();
  } catch (e) {
    console.error(e);
    alert('حصل خطأ أثناء الحفظ!');
  }
});

/*───────────────────────────────
 |  إنشاء الصفين (رئيسي + محاسبة)
 *──────────────────────────────*/
function addLectureRow(priority, num, teacher, dateTime, room, skipSave = false, docId = null) {
  const main = document.createElement('tr');
  const cost = document.createElement('tr');
  cost.classList.add('accounting-row');

  if (docId) {
    main.dataset.docId = cost.dataset.docId = docId;
  }
  // ✅ خزّن نسخة الـ ISO للتاريخ حتى تبقى دائماً صحيحة للحفظ
  main.dataset.dateIso = dateTime;

  // --- الأعمدة الأساسية ---
  [priority, num, teacher].forEach(v => {
    const td = document.createElement('td');
    td.textContent = v;
    main.appendChild(td);
  });

  // خلايا العمل (editable)
  for (let i = 0; i < 10; i++) {
    const td = document.createElement('td');
    td.contentEditable = true;
    td.style.direction = 'rtl';
    main.appendChild(td);
  }

  // عرض التاريخ بشكل مقروء
  let formatted = '';
  if (dateTime) {
    const dt = new Date(dateTime);
    if (!isNaN(dt.getTime())) {
      formatted = new Intl.DateTimeFormat('ar-SY', {
        dateStyle: 'short', timeStyle: 'short', hour12: false
      }).format(dt);
    }
  }
  [formatted, room].forEach(val => {
    const td = document.createElement('td');
    td.textContent = val;
    main.appendChild(td);
  });

  // أعمدة فارغة + زر الحذف
  for (let i = 0; i < 7; i++) main.appendChild(document.createElement('td'));
  main.appendChild(document.createElement('td'));
  const del = document.createElement('td');
  del.innerHTML = '✖';
  del.style = 'cursor:pointer;color:var(--danger);font-weight:bold';
  del.onclick = () => deleteRow(main, cost);
  main.appendChild(del);

  // صف المحاسبة
  for (let i = 0; i < 3; i++) cost.appendChild(document.createElement('td'));
  for (let i = 0; i < 10; i++) {
    const td = document.createElement('td');
    td.contentEditable = true;
    td.classList.add('cost-input');
    cost.appendChild(td);
  }
  for (let i = 0; i < 10; i++) cost.appendChild(document.createElement('td'));
  const totalCell = document.createElement('td');
  totalCell.classList.add('total-cell');
  cost.appendChild(totalCell);
  cost.appendChild(document.createElement('td'));

  // أضف الصفين إلى الجدول
  tableBodyEl.append(main, cost);

  // مستمع blur للحفظ الفوري
  [...main.querySelectorAll('[contenteditable]'), ...cost.querySelectorAll('[contenteditable]')]
    .forEach(td => td.addEventListener('blur', () => syncRowUpdate(main, cost)));

  if (!skipSave) {
    saveRowToAppwrite(main, cost, dateTime, room);
  }
  applyPermissionsToRow(main, cost);
}

/*───────────────────────────────
 |  حذف صف
 *──────────────────────────────*/
function deleteRow(main, cost) {
  if (currentRole !== 'admin') return;
  const id = main.dataset.docId;
  main.remove();
  cost.remove();
  calculateSummary();
  if (id) {
    databases.deleteDocument(databaseId, collectionId, id).catch(console.error);
  }
}

/*───────────────────────────────
 |  تحديث صف (حفظ بعد blur)
 *──────────────────────────────*/
function syncRowUpdate(main, cost) {
  if (!navigator.onLine) {
    pushToQueue('update', { id: main.dataset.docId, data: collectRowData(main, cost) });
    return;
  }
  updateRowTotal(cost);
  if (currentRole === 'accountant') return; // المحاسب فقط يحسب الإجمالي ولا يحدّث Appwrite

  databases.updateDocument(databaseId, collectionId, main.dataset.docId, collectRowData(main, cost))
           .catch(console.error);
  sortTable();
}

/*───────────────────────────────
 |  تجميع بيانات الصف
 *──────────────────────────────*/
function collectRowData(main, cost) {
  const m = main.querySelectorAll('td');
  const c = cost.querySelectorAll('.cost-input');

  return {
    priority     : m[0].textContent,
    lectureNumber: m[1].textContent,
    teacherName  : m[2].textContent,
    recordDate   : main.dataset.dateIso || new Date().toISOString(), // ✅ دوماً ISO
    recordRoom   : m[14].textContent,
    mainCells    : [...m].slice(3, 13).map(td => td.textContent),
    cellColors   : [...m].slice(3, 13).map(td => td.style.backgroundColor || ''),
    costs        : [...c].map(td => td.textContent),
    totalCost    : cost.querySelector('.total-cell').textContent
  };
}

/*───────────────────────────────
 |  تحميل البيانات من Appwrite
 *──────────────────────────────*/
function loadFromAppwrite() {
  databases.listDocuments(databaseId, collectionId)
    .then(({ documents }) => {
      tableBodyEl.innerHTML = '';
      documents.forEach(doc => addLectureRow(
        doc.priority, doc.lectureNumber, doc.teacherName,
        doc.recordDate, doc.recordRoom, true, doc.$id
      ));
      calculateSummary();
      sortTable();
      applyPermissions();
      initRealtimeOnce();
    })
    .catch(console.error);
}

/*───────────────────────────────
 |  Realtime
 *──────────────────────────────*/
let realtimeStarted = false;
function initRealtimeOnce() {
  if (!realtimeStarted) { initRealtime(); realtimeStarted = true; }
}

function initRealtime() {
  const ch = `databases.${databaseId}.collections.${collectionId}.documents`;
  client.subscribe(ch, res => {
    const ev  = res.event || res.events?.[0] || '';
    const doc = res.payload || {};

    if (ev.endsWith('.create')) {
      if (document.querySelector(`tr[data-doc-id="${doc.$id}"]`)) return;
      addLectureRow(doc.priority, doc.lectureNumber, doc.teacherName,
                    doc.recordDate, doc.recordRoom, true, doc.$id);
      sortTable();

    } else if (ev.endsWith('.update')) {
      const main = document.querySelector(`tr[data-doc-id="${doc.$id}"]`);
      if (!main) return;
      const cost = main.nextElementSibling;

      // ✅ خزّن ISO الحقيقي + أعِد تنسيق العرض
      main.dataset.dateIso = doc.recordDate;

      const dt2 = new Date(doc.recordDate);
      main.children[13].textContent = !isNaN(dt2.getTime())
        ? new Intl.DateTimeFormat('ar-SY', { dateStyle:'short', timeStyle:'short', hour12:false }).format(dt2)
        : '';
      main.children[14].textContent = doc.recordRoom;
      doc.mainCells.forEach((v,i) => main.children[3+i].textContent = v);
      doc.cellColors.forEach((c,i) => main.children[3+i].style.backgroundColor = c || '');
      cost.querySelectorAll('.cost-input').forEach((td,i) => td.textContent = doc.costs[i] || '');
      cost.querySelector('.total-cell').textContent = doc.totalCost || '';
      calculateSummary();
      sortTable();

    } else if (ev.endsWith('.delete')) {
      const main = document.querySelector(`tr[data-doc-id="${doc.$id}"]`);
      if (main) {
        const cost = main.nextElementSibling;
        main.remove();
        cost.remove();
        calculateSummary();
      }
    }
  });
}

/*───────────────────────────────
 |  حساب المجموعات
 *──────────────────────────────*/
function updateRowTotal(costRow) {
  let sum = 0;
  costRow.querySelectorAll('.cost-input').forEach(c => {
    const v = parseFloat(c.textContent.replace(/,/g,''));
    if (!isNaN(v)) sum += v;
  });
  costRow.querySelector('.total-cell').textContent = sum ? sum.toLocaleString() : '';
  calculateSummary();
}

function calculateSummary() {
  let total = 0;
  document.querySelectorAll('.total-cell').forEach(c => {
    const v = parseFloat(c.textContent.replace(/,/g,''));
    if (!isNaN(v)) total += v;
  });
  totalCostEl.textContent = total.toLocaleString();
}

/*───────────────────────────────
 |  ترتيب الجدول
 *──────────────────────────────*/
function sortTable() {
  const pairs = [];
  for (let i = 0; i < tableBodyEl.children.length; i += 2) {
    const main = tableBodyEl.children[i];
    const cost = tableBodyEl.children[i+1];
    const prio = main.children[0].textContent === '✅' ? 0 : 1;
    const t    = main.dataset.dateIso || '2100-01-01T00:00:00Z';
    pairs.push({ main, cost, prio, time: new Date(t).getTime() });
  }
  pairs.sort((a,b) => a.prio - b.prio || a.time - b.time)
       .forEach(p => tableBodyEl.append(p.main, p.cost));
}

/*───────────────────────────────
 |  طابور العمل دون اتصال
 *──────────────────────────────*/
const localQueueKey = 'myExamsQueue_v1';
function pushToQueue(action, payload) {
  const q = JSON.parse(localStorage.getItem(localQueueKey) || '[]');
  q.push({ action, payload });
  localStorage.setItem(localQueueKey, JSON.stringify(q));
}

async function flushQueue() {
  if (!navigator.onLine) return;
  const q = JSON.parse(localStorage.getItem(localQueueKey) || '[]');
  if (!q.length) return;
  for (const item of q) {
    try {
      if (item.action === 'update') {
        await databases.updateDocument(databaseId, collectionId, item.payload.id, item.payload.data);
      }
    } catch (e) { console.error('Sync error', e); return; }
  }
  localStorage.removeItem(localQueueKey);
}

window.addEventListener('online',  () => { offlineBadge.classList.add('hidden'); flushQueue(); });
window.addEventListener('offline', () => { offlineBadge.classList.remove('hidden'); });
if (!navigator.onLine) offlineBadge.classList.remove('hidden');

/*───────────────────────────────
 |  إنشاء مستند جديد في Appwrite
 *──────────────────────────────*/
function saveRowToAppwrite(main, cost, dateTime, room) {
  const m = main.querySelectorAll('td');
  const c = cost.querySelectorAll('.cost-input');

  const data = {
    priority       : m[0].textContent,
    lectureNumber  : m[1].textContent,
    teacherName    : m[2].textContent,
    recordDate     : new Date(dateTime).toISOString(),
    recordRoom     : room,
    mainCells      : [...m].slice(3,13).map(td => td.textContent),
    cellColors     : [...m].slice(3,13).map(td => td.style.backgroundColor||''),
    costs          : [...c].map(td => td.textContent),
    totalCost      : cost.querySelector('.total-cell').textContent
  };

  databases.createDocument(databaseId, collectionId, ID.unique(), data)
           .then(doc => {
             main.dataset.docId = cost.dataset.docId = doc.$id;
           })
           .catch(console.error);
}

/*───────────────────────────────
 |  الصلاحيات (عرض / تحرير)
 *──────────────────────────────*/
function applyPermissions() {
  const rows = [...tableBodyEl.querySelectorAll('tr')];
  const header = $('taskTable').querySelector('thead tr');
  rows.concat(header).forEach(tr => {
    const costRow = tr.nextElementSibling?.classList.contains('accounting-row') ? tr.nextElementSibling : null;
    applyPermissionsToRow(tr, costRow);
  });
}

function applyPermissionsToRow(main, cost) {
  if (!main) return;
  const cols     = roleCols[currentRole];
  const editable = editableByRole[currentRole] || [];
  const cells    = [...main.children];

  cells.forEach((td,i) => {
    const show = cols === 'all' || cols.includes(i);
    td.classList.toggle('hidden', !show);
    td.contentEditable = (currentRole === 'admin') ? (i !== cells.length-1) : editable.includes(i);
  });

  if (cost) {
    [...cost.children].forEach((td,i) => {
      const show = cols === 'all' || cols.includes(i);
      td.classList.toggle('hidden', !show);
      td.contentEditable = (currentRole === 'admin') ? true : editable.includes(i+26);
    });
  }

  // زر الحذف
  const last = main.children[cells.length-1];
  last.classList.toggle('hidden', currentRole !== 'admin');
}

/*───────────────────────────────
 |  قوائم مخصّصة للحالة والأسماء (كليك يمين)
 *──────────────────────────────*/
const statusHeaders = [
  "تنسيق","رفع","إدخال ملف","رفع أسئلة","إدخال أسئلة",
  "التصوير","مونتاج","إدخال فيديو","تصميم/كتابة","تسويق"
];
const nameHeaders   = ["منسق","رافع","مدخل","المصور","ممنتج","الكاتب"];

// استخرج أرقام الأعمدة
const statusCols = [], nameCols = [];
document.querySelectorAll('#taskTable thead th').forEach((th, idx) => {
  const txt = th.textContent.trim();
  if (statusHeaders.includes(txt)) statusCols.push(idx);
  if (nameHeaders  .includes(txt)) nameCols  .push(idx);
});

const statusOptions = [
  { label:"لم يتم التدخل",                 color:""        },
  { label:"يتم العمل",                     color:"#fff6a3" },
  { label:"تم العمل والتدقيق ولم يُسلَّم", color:"#ffd86a" },
  { label:"منجز",                          color:"#b5f8b1" }
];
const employeeNames = ["محمد","أحمد","علي","نور","خالد","منى","هبة"];

function showMenu(items, x, y, td){
  const menu = document.createElement('div');
  menu.className = 'custom-menu';
  menu.style.cssText = `position:fixed;left:${x}px;top:${y}px;z-index:10000;background:#fff;border:1px solid #ccc;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.15);font-family:Cairo;padding:4px;`;
  items.forEach(item => {
    const row = document.createElement('div');
    row.textContent = item.label || item;
    row.style.cssText = `padding:8px 18px;cursor:pointer;white-space:nowrap;background:${item.color || '#fff'};`;
    row.onmouseover = () => row.style.backgroundColor = '#eee';
    row.onmouseout  = () => row.style.backgroundColor = item.color || '#fff';
    row.onclick = () => {
      const isStatus = typeof item === 'object' && 'color' in item;
      td.textContent = item.label ?? item;
      if (isStatus) td.style.backgroundColor = item.color;
      const mainRow = td.parentElement;
      const costRow = mainRow.nextElementSibling?.classList.contains('accounting-row') ? mainRow.nextElementSibling : null;
      syncRowUpdate(mainRow, costRow);
      menu.remove();
    };
    menu.appendChild(row);
  });
  document.body.appendChild(menu);
  document.addEventListener('click', () => menu.remove(), { once:true });
}

document.addEventListener('contextmenu', e => {
  const td = e.target.closest('td');
  if (!td || !td.isContentEditable) return;
  const col = td.cellIndex;
  if (nameCols.includes(col)) {                      // قائمة أسماء
    e.preventDefault();
    showMenu(employeeNames, e.clientX, e.clientY, td);
  } else if (statusCols.includes(col)) {             // قائمة حالة
    e.preventDefault();
    showMenu(statusOptions, e.clientX, e.clientY, td);
  }
});

// منع أي تبديل لون بالـ click العادي (خليه للتعديل فقط)
document.addEventListener('click', e => {
  const td = e.target.closest('td');
  if (!td || !td.isContentEditable) return;
});

// محوّل rgb() ▸ #hex (يُستخدم لو حبيت تحفظ اللون كـ hex)
function toHex(rgb) {
  if (!rgb) return '';
  if (rgb.startsWith('#')) return rgb.toLowerCase();
  const res = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(rgb);
  return res ? '#' + res.slice(1).map(n=>('0'+(+n).toString(16)).slice(-2)).join('') : '';
}

/*───────────────────────────────*/
// انتهى السكربت ✅
