import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import * as XLSX from "xlsx";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAz1way-cODUpXbqq0x1ba5hvEUSESuH38",
  authDomain: "vogue-suivi-taches.firebaseapp.com",
  projectId: "vogue-suivi-taches",
  storageBucket: "vogue-suivi-taches.firebasestorage.app",
  messagingSenderId: "380089591189",
  appId: "1:380089591189:web:a4b61701a36179e3c9c29c",
  measurementId: "G-XWHM62FQWS"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const STATUSES = ["À faire", "En cours", "Fait", "Non fait"];
const VALIDATIONS = ["Non contrôlé", "Validé", "Non validé"];

const STORE_CODES = {
  "ADMIN-VOGUE-2025": { role: "admin", store: null, name: "Administrateur" },
  "VM-VOGUE-2025": { role: "vm", store: null, name: "Visiteur Merchandising" },
  "LEPORT-2025": { role: "store", store: "Vogue Le Port", name: "Vogue Le Port" },
  "STBENOIT-2025": { role: "store", store: "Vogue Saint-Benoît", name: "Vogue Saint-Benoît" },
  "STDENIS-2025": { role: "store", store: "Vogue Saint-Denis", name: "Vogue Saint-Denis" },
  "STANDRE-2025": { role: "store", store: "Vogue Saint-André", name: "Vogue Saint-André" },
  "TAMPON-2025": { role: "store", store: "Vogue Tampon", name: "Vogue Tampon" },
  "TAMPON400-2025": { role: "store", store: "Vogue Tampon-400", name: "Vogue Tampon-400" },
  "DUPARC-2025": { role: "store", store: "Vogue Duparc", name: "Vogue Duparc" },
};

const DEFAULT_STORES = [
  "Vogue Le Port",
  "Vogue Saint-Benoît",
  "Vogue Saint-Denis",
  "Vogue Saint-André",
  "Vogue Tampon",
  "Vogue Tampon-400",
  "Vogue Duparc",
];

function clsx(...c){return c.filter(Boolean).join(" ");}

function formatDate(d){
  if(!d) return "";
  try{ return new Date(d).toLocaleDateString('fr-FR'); }catch{ return d }
}

function formatDateForExcel(d){
  if(!d) return "";
  try{ 
    const date = new Date(d);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }catch{ return d }
}

export default function App(){
  const [user, setUser] = useState(null);
  const [accessCode, setAccessCode] = useState("");
  const [loginError, setLoginError] = useState("");

  function handleLogin(e){
    e.preventDefault();
    const code = accessCode.trim();
    if(STORE_CODES[code]){
      setUser(STORE_CODES[code]);
      setLoginError("");
    } else {
      setLoginError("Code d'accès invalide");
    }
  }

  function handleLogout(){
    setUser(null);
    setAccessCode("");
  }

  if(!user){
    return (
      <div className="min-h-screen bg-gradient-to-br from-neutral-900 to-neutral-800 flex items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md"
        >
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-neutral-900 mb-2">Vogue</h1>
            <p className="text-neutral-600">Suivi des tâches réseau</p>
          </div>
          
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Code d'accès
              </label>
              <input
                type="text"
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                placeholder="Entrez votre code"
                className="w-full px-4 py-3 rounded-xl border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                autoFocus
              />
            </div>
            
            {loginError && (
              <div className="text-sm text-red-600 bg-red-50 px-4 py-2 rounded-lg">
                {loginError}
              </div>
            )}
            
            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-neutral-900 text-white font-medium hover:bg-neutral-800 transition"
            >
              Se connecter
            </button>
          </form>
          
          <div className="mt-6 text-xs text-neutral-500 text-center">
            Contactez l'administrateur si vous avez oublié votre code
          </div>
        </motion.div>
      </div>
    );
  }

  return <MainApp user={user} onLogout={handleLogout} />;
}

function MainApp({ user, onLogout }){
  const [tasks, setTasks] = useState([]);
  const [stores] = useState(DEFAULT_STORES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "tasks"), orderBy("createdAt", "desc"));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const tasksData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setTasks(tasksData);
      setLoading(false);
    }, (error) => {
      console.error("Erreur de synchronisation:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const [filters, setFilters] = useState({store:"", status:"", validation:"", overdue:false, q:""});

  const filtered = useMemo(()=>{
    const now = new Date();
    return tasks.filter(t=>{
      if(user.role === "store" && t.store !== user.store) return false;
      
      if(filters.store && t.store !== filters.store) return false;
      if(filters.status && t.status !== filters.status) return false;
      if(filters.validation && t.validation !== filters.validation) return false;
      if(filters.overdue){
        if(!t.deadline) return false;
        const dl = new Date(t.deadline);
        if(isNaN(+dl)) return false;
        if(!(dl < now && t.status !== "Fait")) return false;
      }
      if(filters.q){
        const q = filters.q.toLowerCase();
        const pool = `${t.title} ${t.notes||""} ${t.controller||""} ${t.storeManager||""} ${t.feedbackMagasin||""}`.toLowerCase();
        if(!pool.includes(q)) return false;
      }
      return true;
    });
  }, [tasks, filters, user]);

  async function addTask(newTask){
    try {
      await addDoc(collection(db, "tasks"), {
        createdAt: new Date().toISOString(),
        validation: 'Non contrôlé',
        status: 'À faire',
        feedbackMagasin: '',
        ...newTask
      });
    } catch (error) {
      console.error("Erreur ajout tâche:", error);
      alert("Erreur lors de l'ajout de la tâche");
    }
  }

  async function updateTask(id, patch){
    try {
      await updateDoc(doc(db, "tasks", id), patch);
    } catch (error) {
      console.error("Erreur mise à jour:", error);
      alert("Erreur lors de la mise à jour");
    }
  }

  async function deleteTask(id){
    if(!window.confirm("Supprimer cette tâche ?")) return;
    try {
      await deleteDoc(doc(db, "tasks", id));
    } catch (error) {
      console.error("Erreur suppression:", error);
      alert("Erreur lors de la suppression");
    }
  }

  function exportExcel(){
    const excelData = filtered.map(t => ({
      'Magasin': t.store || '',
      'Responsable magasin': t.storeManager || '',
      'Tâche demandée': t.title || '',
      'Commentaire VM': t.notes || '',
      'Retour magasin': t.feedbackMagasin || '',
      'Contrôleur': t.controller || '',
      'Date de passage': formatDateForExcel(t.date),
      'Deadline': formatDateForExcel(t.deadline),
      'Statut': t.status || '',
      'Validation': t.validation || '',
      'Date de création': formatDateForExcel(t.createdAt),
      'ID': t.id || ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    
    const colWidths = [
      { wch: 20 }, { wch: 20 }, { wch: 35 }, { wch: 40 }, { wch: 40 }, { wch: 20 },
      { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 15 }, { wch: 18 }, { wch: 38 },
    ];
    worksheet['!cols'] = colWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Tâches");

    const fileName = `Suivi_Taches_Vogue_${new Date().toISOString().slice(0,10)}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  }

  async function importExcel(e){
    const file = e.target.files?.[0]; 
    if(!file) return;
    
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet);
        
        for (const row of jsonData) {
          const taskData = {
            store: row['Magasin'] || '',
            storeManager: row['Responsable magasin'] || '',
            title: row['Tâche demandée'] || '',
            notes: row['Commentaire VM'] || '',
            feedbackMagasin: row['Retour magasin'] || '',
            controller: row['Contrôleur'] || '',
            date: parseExcelDate(row['Date de passage']) || new Date().toISOString().slice(0,10),
            deadline: parseExcelDate(row['Deadline']) || '',
            status: row['Statut'] || 'À faire',
            validation: row['Validation'] || 'Non contrôlé',
            createdAt: parseExcelDate(row['Date de création']) || new Date().toISOString()
          };
          
          await addDoc(collection(db, "tasks"), taskData);
        }
        
        alert(`${jsonData.length} tâche(s) importée(s) avec succès !`);
      } catch(err) { 
        console.error(err);
        alert('Erreur lors de l\'import du fichier Excel'); 
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  }

  function parseExcelDate(dateStr){
    if(!dateStr) return '';
    
    if(typeof dateStr === 'string' && dateStr.includes('-')) return dateStr;
    
    if(typeof dateStr === 'number'){
      const date = XLSX.SSF.parse_date_code(dateStr);
      return `${date.y}-${String(date.m).padStart(2,'0')}-${String(date.d).padStart(2,'0')}`;
    }
    
    if(typeof dateStr === 'string' && dateStr.includes('/')){
      const parts = dateStr.split('/');
      if(parts.length === 3){
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
    }
    
    return '';
  }

  const canCreateTasks = user.role === "admin" || user.role === "vm";
  const canDelete = user.role === "admin";

  if(loading) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-2xl font-semibold mb-2">Chargement...</div>
          <div className="text-neutral-600">Synchronisation avec Firebase</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 p-6">
      <header className="max-w-7xl mx-auto mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Suivi des tâches réseau – Vogue</h1>
            <p className="text-sm text-neutral-600">Créez, suivez et validez les tâches assignées aux responsables de magasin.</p>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-xs text-green-600">🟢 Synchronisé en temps réel</span>
              <span className="text-xs bg-neutral-900 text-white px-3 py-1 rounded-full">
                {user.name}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={exportExcel} className="px-3 py-2 rounded-xl shadow bg-green-600 text-white hover:bg-green-700">
              📊 Exporter Excel
            </button>
            {(user.role === "admin" || user.role === "vm") && (
              <label className="px-3 py-2 rounded-xl shadow bg-blue-600 text-white hover:bg-blue-700 cursor-pointer">
                📥 Importer Excel
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={importExcel} />
              </label>
            )}
            <button onClick={onLogout} className="px-3 py-2 rounded-xl shadow bg-neutral-900 text-white hover:bg-neutral-800">
              🚪 Déconnexion
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        {canCreateTasks && (
          <motion.section layout className="lg:col-span-1 bg-white rounded-2xl shadow p-4">
            <h2 className="text-lg font-medium mb-3">Nouvelle tâche</h2>
            <TaskForm stores={stores} onAdd={addTask} />
          </motion.section>
        )}

        <motion.section layout className={clsx("bg-white rounded-2xl shadow p-4", canCreateTasks ? "lg:col-span-2" : "lg:col-span-3")}>
          <div className="flex flex-col md:flex-row md:items-end gap-3 mb-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 flex-1">
              {user.role !== "store" && (
                <Select label="Magasin" value={filters.store} onChange={v=>setFilters(f=>({...f, store:v}))} options={["", ...stores]} />
              )}
              <Select label="Statut" value={filters.status} onChange={v=>setFilters(f=>({...f, status:v}))} options={["", ...STATUSES]} />
              <Select label="Validation" value={filters.validation} onChange={v=>setFilters(f=>({...f, validation:v}))} options={["", ...VALIDATIONS]} />
              <Toggle label="En retard" checked={filters.overdue} onChange={v=>setFilters(f=>({...f, overdue:v}))} />
              <Input label="Recherche" value={filters.q} onChange={v=>setFilters(f=>({...f, q:v}))} placeholder="mot-clé, nom…" />
            </div>
            <button onClick={()=>setFilters({store:"", status:"", validation:"", overdue:false, q:""})} className="px-3 py-2 rounded-xl bg-neutral-900 text-white">Réinitialiser</button>
          </div>

          <TaskTable tasks={filtered} onUpdate={updateTask} onDelete={canDelete ? deleteTask : null} userRole={user.role} />
        </motion.section>
      </main>
    </div>
  );
}function TaskForm({stores, onAdd}){
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0,10),
    store: stores[0] || "",
    controller: "",
    storeManager: "",
    title: "",
    deadline: "",
    notes: "",
    allStores: false,
  });
  useEffect(()=>{ if(!stores.includes(form.store) && !form.allStores) setForm(f=>({...f, store: stores[0] || ""})) },[stores, form.store, form.allStores]);

  async function submit(e){ 
    e.preventDefault();
    if(!form.title){ alert("Renseignez au minimum la tâche."); return; }
    
    if(form.allStores){
      if(!window.confirm(`Créer cette tâche pour les ${stores.length} magasins ?`)) return;
      
      for(const store of stores){
        const taskData = {
          date: form.date,
          store: store,
          controller: form.controller,
          storeManager: "",
          title: form.title,
          deadline: form.deadline,
          notes: form.notes,
        };
        await onAdd(taskData);
      }
      
      alert(`Tâche créée pour ${stores.length} magasins !`);
    } else {
      if(!form.store){ alert("Renseignez le magasin."); return; }
      await onAdd(form);
    }
    
    setForm(f=>({...f, title: "", notes: "", storeManager: ""}));
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label="Date de passage" type="date" value={form.date} onChange={v=>setForm(f=>({...f, date:v}))} />
        <div>
          <label className="block text-sm mb-2">
            <span className="text-neutral-700">Affecter à</span>
          </label>
          <div className="flex items-center gap-2">
            <button 
              type="button"
              onClick={()=>setForm(f=>({...f, allStores: false}))}
              className={clsx("flex-1 px-3 py-2 rounded-xl border text-sm", 
                !form.allStores ? "bg-neutral-900 text-white" : "bg-white"
              )}
            >
              Un magasin
            </button>
            <button 
              type="button"
              onClick={()=>setForm(f=>({...f, allStores: true}))}
              className={clsx("flex-1 px-3 py-2 rounded-xl border text-sm",
                form.allStores ? "bg-neutral-900 text-white" : "bg-white"
              )}
            >
              Tous les magasins
            </button>
          </div>
        </div>
      </div>
      
      {!form.allStores && (
        <Select label="Magasin" value={form.store} onChange={v=>setForm(f=>({...f, store:v}))} options={stores} />
      )}
      
      {form.allStores && (
        <div className="text-sm bg-blue-50 text-blue-700 px-3 py-2 rounded-lg">
          ℹ️ La tâche sera créée pour les {stores.length} magasins
        </div>
      )}
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label="Contrôleur" value={form.controller} onChange={v=>setForm(f=>({...f, controller:v}))} />
        {!form.allStores && (
          <Input label="Resp. magasin" value={form.storeManager} onChange={v=>setForm(f=>({...f, storeManager:v}))} />
        )}
      </div>
      <Input label="Tâche demandée" value={form.title} onChange={v=>setForm(f=>({...f, title:v}))} placeholder="Ex.: Refaire facing rayon jeans" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label="Deadline" type="date" value={form.deadline} onChange={v=>setForm(f=>({...f, deadline:v}))} />
        <Textarea label="Commentaire VM" value={form.notes} onChange={v=>setForm(f=>({...f, notes:v}))} placeholder="Instructions, détails, consignes…" />
      </div>
      <button onClick={submit} className="w-full py-2 rounded-xl bg-neutral-900 text-white hover:bg-neutral-800">
        {form.allStores ? `Créer pour ${stores.length} magasins` : "Ajouter la tâche"}
      </button>
    </div>
  );
}

function TaskTable({tasks, onUpdate, onDelete, userRole}){
  if(!tasks.length) return <p className="text-sm text-neutral-500">Aucune tâche pour ces filtres.</p>;
  return (
    <div className="overflow-auto border rounded-2xl">
      <table className="min-w-full text-sm">
        <thead className="bg-neutral-50">
          <tr>
            <Th>Magasin</Th>
            <Th>Tâche</Th>
            <Th>Passage</Th>
            <Th>Deadline</Th>
            <Th>Statut</Th>
            {(userRole === "admin" || userRole === "vm") && <Th>Validation</Th>}
            <Th>Actions</Th>
          </tr>
        </thead>
        <tbody>
          {tasks.map(t=> <TaskRow key={t.id} t={t} onUpdate={onUpdate} onDelete={onDelete} userRole={userRole} />)}
        </tbody>
      </table>
    </div>
  );
}

function TaskRow({t, onUpdate, onDelete, userRole}){
  const overdue = useMemo(()=>{
    if(!t.deadline || t.status === 'Fait') return false;
    const dl = new Date(t.deadline); if(isNaN(+dl)) return false;
    return dl < new Date();
  }, [t.deadline, t.status]);

  return (
    <tr className="border-t hover:bg-neutral-50">
      <td className="align-top px-3 py-2 whitespace-nowrap">
        <div className="font-medium">{t.store}</div>
        <div className="text-neutral-500 text-xs">{t.storeManager || "Resp. magasin ?"}</div>
      </td>
      <td className="align-top px-3 py-2">
        <div className="font-medium">{t.title}</div>
        {t.notes && <div className="text-neutral-500 text-xs mt-1"><strong>Commentaire VM:</strong> {t.notes}</div>}
        {t.feedbackMagasin && <div className="text-blue-600 text-xs mt-1"><strong>Retour magasin:</strong> {t.feedbackMagasin}</div>}
        <div className="text-xs text-neutral-400 mt-1">Contrôleur: {t.controller || "—"}</div>
      </td>
      <td className="align-top px-3 py-2 whitespace-nowrap">{formatDate(t.date)}</td>
      <td className="align-top px-3 py-2 whitespace-nowrap">
        <div className={clsx(overdue?"text-red-600 font-semibold":"")}>{formatDate(t.deadline) || "—"}</div>
        {overdue && <span className="text-xs bg-red-50 text-red-700 px-2 py-0.5 rounded-lg">En retard</span>}
      </td>
      <td className="align-top px-3 py-2 whitespace-nowrap">
        <select value={t.status} onChange={e=>onUpdate(t.id,{status:e.target.value})} className="px-2 py-1 rounded-lg border bg-white text-xs">
          {STATUSES.map(s=> <option key={s} value={s}>{s}</option>)}
        </select>
      </td>
      {(userRole === "admin" || userRole === "vm") && (
        <td className="align-top px-3 py-2 whitespace-nowrap">
          <select value={t.validation} onChange={e=>onUpdate(t.id,{validation:e.target.value})} className="px-2 py-1 rounded-lg border bg-white text-xs">
            {VALIDATIONS.map(v=> <option key={v} value={v}>{v}</option>)}
          </select>
        </td>
      )}
      <td className="align-top px-3 py-2 whitespace-nowrap">
        <div className="flex items-center gap-2">
          <button 
            onClick={()=>onUpdate(t.id, {feedbackMagasin: prompt('Retour magasin sur cette tâche', t.feedbackMagasin||'') ?? t.feedbackMagasin})} 
            className="px-2 py-1 rounded-lg bg-white border text-xs hover:bg-neutral-50"
            title="Ajouter un retour magasin"
          >
            💬
          </button>
          {onDelete && (
            <button onClick={()=>onDelete(t.id)} className="px-2 py-1 rounded-lg bg-white border text-xs hover:bg-red-50">🗑️</button>
          )}
        </div>
      </td>
    </tr>
  );
}

function Th({children}){ return <th className="text-left font-medium px-3 py-2 whitespace-nowrap text-xs">{children}</th>; }

function Input({label, value, onChange, type="text", placeholder}){
  return (
    <label className="block text-sm">
      <span className="text-neutral-700">{label}</span>
      <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} className="mt-1 w-full px-3 py-2 rounded-xl border focus:outline-none focus:ring-2" />
    </label>
  );
}

function Textarea({label, value, onChange, placeholder}){
  return (
    <label className="block text-sm">
      <span className="text-neutral-700">{label}</span>
      <textarea value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} rows={3} className="mt-1 w-full px-3 py-2 rounded-xl border focus:outline-none focus:ring-2" />
    </label>
  );
}

function Select({label, value, onChange, options}){
  return (
    <label className="block text-sm">
      <span className="text-neutral-700">{label}</span>
      <select value={value} onChange={e=>onChange(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-xl border bg-white">
        {options.map(op=> <option key={op} value={op}>{op || "—"}</option>)}
      </select>
    </label>
  );
}

function Toggle({label, checked, onChange}){
  return (
    <label className="block text-sm select-none">
      <span className="text-neutral-700">{label}</span>
      <div className="mt-1 flex items-center gap-2">
        <button type="button" onClick={()=>onChange(!checked)} className={clsx("px-3 py-2 rounded-xl border", checked?"bg-neutral-900 text-white":"bg-white")}>{checked?"Oui":"Non"}</button>
      </div>
    </label>
  );
}
