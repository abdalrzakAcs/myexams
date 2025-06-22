const { Client, Databases, Account, ID } = Appwrite;
const client = new Client()
  .setEndpoint('https://fra.cloud.appwrite.io/v1')
  .setProject('66cf3db2002471686c6f');
const account   = new Account(client);
const databases = new Databases(client);
const databaseId   = '68136c4cee33221deb0f';
const collectionId = 'tasks';

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

  setInterval(() => 
    databases.listDocuments(databaseId, collectionId, [], 1, 0)
             .catch(() => {}),
    10000
  );
}

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
    teacherName: teacher,
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

function addLectureRow(priority, num, teacher, dateTime, room, skipSave = false, docId = null) {
  const main = document.createElement('tr');
  const cost = document.createElement('tr');
  cost.classList.add('accounting-row');
  
  if (docId) {
    main.dataset.docId = cost.dataset.docId = docId;
  }

  [priority, num, teacher].forEach(v => {
    const td = document.createElement('td');
    td.textContent = v;
    main.appendChild(td);
  });

  for (let i = 0; i < 10; i++) {
    const td = document.createElement('td');
    td.contentEditable = true;
    td.style.direction = 'rtl';
    main.appendChild(td);
  }

let formatted = '';
if (dateTime) {
  const dt = new Date(dateTime);
  if (!isNaN(dt.getTime())) {
    formatted = new Intl.DateTimeFormat('ar-SY', {
      dateStyle: 'short',
      timeStyle: 'short',
      hour12: false
    }).format(dt);
  }
}
[formatted, room].forEach(val => {
  const td = document.createElement('td');
  td.textContent = val;
  main.appendChild(td);
});

  for (let i = 0; i < 7; i++) main.appendChild(document.createElement('td'));
  main.appendChild(document.createElement('td'));
  const del = document.createElement('td');
  del.innerHTML = '✖';
  del.style = 'cursor:pointer;color:var(--danger);font-weight:bold';
  del.onclick = () => deleteRow(main, cost);
  main.appendChild(del);

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

  tableBodyEl.append(main, cost);

  [...main.querySelectorAll('[contenteditable]'),
   ...cost.querySelectorAll('[contenteditable]')]
    .forEach(td => td.addEventListener('blur', () => syncRowUpdate(main, cost)));

  if (!skipSave) {
    saveRowToAppwrite(main, cost, dateTime, room);
  }
  applyPermissionsToRow(main, cost);
}

function deleteRow(main, cost) {
  if (currentRole !== 'admin') return;
  const id = main.dataset.docId;
  main.remove();
  cost.remove();
  calculateSummary();
  if (id) {
    databases.deleteDocument(databaseId, collectionId, id)
             .catch(console.error);
  }
}

function syncRowUpdate(main, cost) {
  if (!navigator.onLine) {
    pushToQueue('update', {
      id: main.dataset.docId,
      data: collectRowData(main, cost)
    });
    return;
  }
  updateRowTotal(cost);
  if (currentRole === 'accountant') return;
  databases.updateDocument(databaseId, collectionId, main.dataset.docId, collectRowData(main, cost))
           .catch(console.error);
  sortTable();
}

function collectRowData(main, cost) {
  const m = main.querySelectorAll('td');
  const c = cost.querySelectorAll('.cost-input');
  return {
    priority     : m[0].textContent,
    lectureNumber: m[1].textContent,
    teacherName  : m[2].textContent,
    recordDate   : m[13].textContent,
    recordRoom   : m[14].textContent,
    mainCells    : [...m].slice(3,13).map(td => td.textContent),
    cellColors   : [...m].slice(3,13).map(td => td.style.backgroundColor||''),
    costs        : [...c].map(td => td.textContent),
    totalCost    : cost.querySelector('.total-cell').textContent
  };
}

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

let realtimeStarted = false;
function initRealtimeOnce() {
  if (!realtimeStarted) {
    initRealtime();
    realtimeStarted = true;
  }
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
     const dt2 = new Date(doc.recordDate);
main.children[13].textContent = !isNaN(dt2.getTime())
  ? new Intl.DateTimeFormat('ar-SY', {
      dateStyle: 'short',
      timeStyle: 'short',
      hour12: false
    }).format(dt2)
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

function sortTable() {
  const pairs = [];
  for (let i = 0; i < tableBodyEl.children.length; i += 2) {
    const main = tableBodyEl.children[i],
          cost = tableBodyEl.children[i+1],
          prio = main.children[0].textContent === '✅' ? 0 : 1,
          t    = main.children[13]?.textContent.trim() || '2100-01-01 00:00';
    pairs.push({ main, cost, prio, time: new Date(t.replace(/[\u200f\u200e]/g,'')).getTime() });
  }
  pairs.sort((a,b) => a.prio - b.prio || a.time - b.time)
       .forEach(p => tableBodyEl.append(p.main, p.cost));
}

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
        await databases.updateDocument(
          databaseId, collectionId,
          item.payload.id, item.payload.data
        );
      }
    } catch (e) { console.error('Sync error', e); return; }
  }
  localStorage.removeItem(localQueueKey);
}

window.addEventListener('online',  () => { offlineBadge.classList.add('hidden'); flushQueue(); });
window.addEventListener('offline', () => { offlineBadge.classList.remove('hidden'); });
if (!navigator.onLine) offlineBadge.classList.remove('hidden');

function saveRowToAppwrite(main, cost, dateTime, room) {
  const m = main.querySelectorAll('td'),
        c = cost.querySelectorAll('.cost-input');
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
  const cols    = roleCols[currentRole];
  const editable = editableByRole[currentRole] || [];
  const cells   = [...main.children];

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
// 🟢 تفعيل قائمة الألوان أو أسماء الموظفين بناءً على نوع الخلية
document.addEventListener("contextmenu", (e) => {
  const td = e.target.closest("td");
  if (!td || !td.isContentEditable) return;

  const col = td.cellIndex;
  const taskCols = [3, 5, 7, 9, 13, 16, 18];  // أعمدة "المهام" (لون + حالة)
  const nameCols = taskCols.map((i) => i + 1); // الأعمدة التي بعدها = أسماء

  // خيارات الألوان والحالات
  const statusOptions = [
    { label: "لم يتم التدخل", color: "" },
    { label: "يتم العمل", color: "#fff6a3" },
    { label: "تم العمل والتدقيق ولم يُسلَّم", color: "#ffd86a" },
    { label: "منجز", color: "#b5f8b1" },
  ];

  // قائمة الموظفين
  const employeeNames = ["محمد", "أحمد", "نور", "خالد", "منى", "هبة"];

  // حذف قائمة قديمة
  document.querySelectorAll(".custom-menu").forEach((el) => el.remove());

  const menu = document.createElement("div");
  menu.className = "custom-menu";
  menu.style = `
    position: fixed;
    top: ${e.clientY}px;
    left: ${e.clientX}px;
    background: white;
    border: 1px solid #ccc;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,.15);
    z-index: 9999;
    overflow: hidden;
    font-family: "Cairo", sans-serif;
  `;

  const options = taskCols.includes(col)
    ? statusOptions
    : nameCols.includes(col)
    ? employeeNames.map((name) => ({ label: name }))
    : [];

  if (!options.length) return;

  options.forEach((opt) => {
    const item = document.createElement("div");
    item.textContent = opt.label;
    item.style = `
      padding: 10px 20px;
      cursor: pointer;
      white-space: nowrap;
      background: ${opt.color || "white"};
    `;
    item.addEventListener("mouseover", () => (item.style.backgroundColor = "#eee"));
    item.addEventListener("mouseout", () => (item.style.backgroundColor = opt.color || "white"));
    item.addEventListener("click", () => {
      td.textContent = opt.label;
      if (opt.color !== undefined) td.style.backgroundColor = opt.color;
      td.dispatchEvent(new Event("blur"));
      menu.remove();
    });
    menu.appendChild(item);
  });

  document.body.appendChild(menu);
  e.preventDefault();
});

// 🧼 إغلاق القائمة عند الضغط بالخارج
document.addEventListener("click", () => {
  document.querySelectorAll(".custom-menu").forEach((el) => el.remove());
});

