import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import * as XLSX from "xlsx";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy } from "firebase/firestore";
import imageCompression from "browser-image-compression";

const firebaseConfig = {
  apiKey: "AIzaSyAz1way-cODUpXbqq0x1ba5hvEUSESuH38",
  authDomain: "vogue-suivi-taches.firebaseapp.com",
  projectId: "vogue-suivi-taches",
  messagingSenderId: "380089591189",
  appId: "1:380089591189:web:a4b61701a36179e3c9c29c",
  measurementId: "G-XWHM62FQWS"
};

// Clé API ImgBB
const IMGBB_API_KEY = "85f8179aced261999f475369e3f96650";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const STATUSES = ["Non conforme", "En cours", "Conforme", "Non fait"];
const VALIDATIONS = ["En attente de validation", "Validé", "Non validé"];

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
            <p className="text-neutral-600">Suivi des standards réseau</p>
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
        if(!(dl < now && t.status !== "Conforme")) return false;
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
      // S'assurer que guidePhotos et storePhotos sont des tableaux
      // IMPORTANT: guidePhotos doit être inclus APRÈS le spread pour ne pas être écrasé
      const taskData = {
        createdAt: new Date().toISOString(),
        validation: 'En attente de validation',
        status: 'Non conforme',
        feedbackMagasin: '',
        ...newTask, // Spread d'abord
        // Puis forcer guidePhotos et storePhotos pour s'assurer qu'ils sont bien des tableaux
        guidePhotos: Array.isArray(newTask.guidePhotos) ? newTask.guidePhotos : (newTask.guidePhotos || []),
        storePhotos: Array.isArray(newTask.storePhotos) ? newTask.storePhotos : (newTask.storePhotos || []),
      };
      console.log("addTask - Données finales envoyées à Firestore :", taskData);
      console.log("addTask - guidePhotos:", taskData.guidePhotos, "Type:", Array.isArray(taskData.guidePhotos), "Length:", taskData.guidePhotos?.length);
      const docRef = await addDoc(collection(db, "tasks"), taskData);
      console.log("addTask - Document créé avec ID:", docRef.id);
      return { id: docRef.id };
    } catch (error) {
      console.error("Erreur ajout standard:", error);
      alert("Erreur lors de l'ajout du standard");
      return null;
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
    if(!window.confirm("Supprimer ce standard ?")) return;
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
      'Standard demandé': t.title || '',
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
    XLSX.utils.book_append_sheet(workbook, worksheet, "Standards");

    const fileName = `Suivi_Standards_Vogue_${new Date().toISOString().slice(0,10)}.xlsx`;
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
            title: row['Standard demandé'] || '',
            notes: row['Commentaire VM'] || '',
            feedbackMagasin: row['Retour magasin'] || '',
            controller: row['Contrôleur'] || '',
            date: parseExcelDate(row['Date de passage']) || new Date().toISOString().slice(0,10),
            deadline: parseExcelDate(row['Deadline']) || '',
            status: row['Statut'] || 'Non conforme',
            validation: row['Validation'] || 'En attente de validation',
            createdAt: parseExcelDate(row['Date de création']) || new Date().toISOString()
          };
          
          await addDoc(collection(db, "tasks"), taskData);
        }
        
        alert(`${jsonData.length} standard(s) importé(s) avec succès !`);
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

  async function uploadPhoto(taskId, file, isGuidePhoto = false){
    try {
      // Compression de l'image avant upload pour optimiser la vitesse
      const options = {
        maxSizeMB: 1,
        maxWidthOrHeight: 1200,
        useWebWorker: true
      };
      const compressedFile = await imageCompression(file, options);
      
      // Conversion en base64 pour ImgBB (l'API ImgBB accepte base64)
      const reader = new FileReader();
      const base64 = await new Promise((resolve, reject) => {
        reader.onload = () => {
          // Extraire la partie base64 (après la virgule)
          const base64String = reader.result.split(',')[1];
          resolve(base64String);
        };
        reader.onerror = reject;
        reader.readAsDataURL(compressedFile);
      });
      
      // Upload vers ImgBB via FormData
      const formData = new FormData();
      formData.append('key', IMGBB_API_KEY);
      formData.append('image', base64);
      
      const response = await fetch('https://api.imgbb.com/1/upload', {
        method: 'POST',
        body: formData
      });
      
      const data = await response.json();
      
      if (!response.ok || !data.success) {
        throw new Error(data.error?.message || 'Erreur lors de l\'upload vers ImgBB');
      }
      
      // Retourner l'URL directe de l'image depuis la réponse ImgBB
      // data.data.url est l'URL directe de l'image
      const imageUrl = data.data.url;
      console.log('Photo uploadée sur ImgBB:', imageUrl);
      return imageUrl;
    } catch (error) {
      console.error("Erreur upload photo:", error);
      throw error;
    }
  }

  async function addPhotoToTask(taskId, photoUrl, isGuidePhoto = false){
    const field = isGuidePhoto ? 'guidePhotos' : 'storePhotos';
    const task = tasks.find(t => t.id === taskId);
    if(!task) {
      console.error('Tâche non trouvée:', taskId);
      return;
    }
    
    const currentPhotos = task[field] || [];
    if(!isGuidePhoto && currentPhotos.length >= 5){
      alert("Maximum 5 photos de conformité par standard");
      return;
    }
    
    // Ajouter l'URL directe de l'image au tableau dans Firestore
    const updatedPhotos = [...currentPhotos, photoUrl];
    console.log(`Ajout photo dans ${field}:`, photoUrl);
    await updateTask(taskId, { [field]: updatedPhotos });
  }

  async function removePhotoFromTask(taskId, photoUrl, isGuidePhoto = false){
    try {
      const field = isGuidePhoto ? 'guidePhotos' : 'storePhotos';
      const task = tasks.find(t => t.id === taskId);
      if(!task) return;
      
      const currentPhotos = task[field] || [];
      const updatedPhotos = currentPhotos.filter(url => url !== photoUrl);
      await updateTask(taskId, { [field]: updatedPhotos });
      
      // Note: ImgBB ne nécessite pas de suppression explicite du fichier
      // L'image reste sur ImgBB mais n'est plus référencée dans Firestore
    } catch (error) {
      console.error("Erreur suppression photo:", error);
      alert("Erreur lors de la suppression de la photo");
    }
  }

  async function handlePhotoUpload(taskId, file, isGuidePhoto = false){
    try {
      const photoUrl = await uploadPhoto(taskId, file, isGuidePhoto);
      await addPhotoToTask(taskId, photoUrl, isGuidePhoto);
    } catch (error) {
      alert("Erreur lors de l'upload de la photo");
    }
  }

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
            <h1 className="text-3xl font-semibold tracking-tight">Vogue - Suivi Réseau</h1>
            <p className="text-sm text-neutral-600">Créez, suivez et validez les standards assignés aux responsables de magasin.</p>
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
            <h2 className="text-lg font-medium mb-3">Nouveau standard / action standard</h2>
            <TaskForm stores={stores} onAdd={addTask} userRole={user.role} onPhotoUpload={handlePhotoUpload} />
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

          <TaskTable 
            tasks={filtered} 
            onUpdate={updateTask} 
            onDelete={canDelete ? deleteTask : null} 
            userRole={user.role}
            onPhotoUpload={handlePhotoUpload}
            onPhotoRemove={removePhotoFromTask}
          />
        </motion.section>
      </main>
    </div>
  );
}function TaskForm({stores, onAdd, userRole, onPhotoUpload}){
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
  const [guidePhotoFiles, setGuidePhotoFiles] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  useEffect(()=>{ if(!stores.includes(form.store) && !form.allStores) setForm(f=>({...f, store: stores[0] || ""})) },[stores, form.store, form.allStores]);

  async function uploadPhotosForCreation(files){
    const photoUrls = [];
    for(const file of files){
      try {
        const options = {
          maxSizeMB: 1,
          maxWidthOrHeight: 1200,
          useWebWorker: true
        };
        const compressedFile = await imageCompression(file, options);
        
        const reader = new FileReader();
        const base64 = await new Promise((resolve, reject) => {
          reader.onload = () => {
            const base64String = reader.result.split(',')[1];
            resolve(base64String);
          };
          reader.onerror = reject;
          reader.readAsDataURL(compressedFile);
        });
        
        const formData = new FormData();
        formData.append('key', IMGBB_API_KEY);
        formData.append('image', base64);
        
        const response = await fetch('https://api.imgbb.com/1/upload', {
          method: 'POST',
          body: formData
        });
        
        const data = await response.json();
        
        if (!response.ok || !data.success) {
          throw new Error(data.error?.message || 'Erreur lors de l\'upload vers ImgBB');
        }
        
        photoUrls.push(data.data.url);
        console.log('Photo uploadée sur ImgBB:', data.data.url);
      } catch (error) {
        console.error("Erreur upload photo:", error);
        throw error;
      }
    }
    return photoUrls;
  }

  async function submit(e){ 
    e.preventDefault();
    if(!form.title){ alert("Renseignez au minimum le standard."); return; }
    if(isUploading) return; // Empêcher les clics multiples
    
    setIsUploading(true);
    
    try {
      // Uploader les photos guides AVANT de créer la tâche (même logique que pour les photos de conformité)
      let guidePhotoUrls = [];
      if((userRole === "admin" || userRole === "vm") && guidePhotoFiles.length > 0){
        console.log('Upload de', guidePhotoFiles.length, 'photo(s) guide(s) vers ImgBB...');
        try {
          guidePhotoUrls = await uploadPhotosForCreation(guidePhotoFiles);
          console.log('URLs guidePhotos récupérées:', guidePhotoUrls);
          console.log('Type de guidePhotoUrls:', Array.isArray(guidePhotoUrls) ? 'Array' : typeof guidePhotoUrls);
        } catch (error) {
          console.error('Erreur upload photos guides:', error);
          alert('Erreur lors de l\'upload des photos de référence. Veuillez réessayer.');
          setIsUploading(false);
          return;
        }
      }
      
      if(form.allStores){
        if(!window.confirm(`Créer ce standard pour les ${stores.length} magasins ?`)) {
          setIsUploading(false);
          return;
        }
        
        for(const store of stores){
          // Construire taskData explicitement pour s'assurer que guidePhotos est inclus
          const taskData = {
            date: form.date,
            store: store,
            controller: form.controller,
            storeManager: "",
            title: form.title,
            deadline: form.deadline,
            notes: form.notes,
            guidePhotos: Array.isArray(guidePhotoUrls) ? guidePhotoUrls : [], // Forcer le tableau
            storePhotos: [], // Initialiser le tableau
          };
          console.log("Données envoyées à Firestore (tous magasins):", taskData);
          console.log("guidePhotos dans taskData:", taskData.guidePhotos, "Type:", Array.isArray(taskData.guidePhotos));
          await onAdd(taskData);
        }
        
        alert(`Standard créé pour ${stores.length} magasins !`);
      } else {
        if(!form.store){ 
          alert("Renseignez le magasin."); 
          setIsUploading(false);
          return;
        }
        // Créer taskData en s'assurant que guidePhotos est bien inclus (même logique que pour les photos de conformité)
        const taskData = {
          date: form.date,
          store: form.store,
          controller: form.controller,
          storeManager: form.storeManager,
          title: form.title,
          deadline: form.deadline,
          notes: form.notes,
          guidePhotos: Array.isArray(guidePhotoUrls) ? guidePhotoUrls : [], // Forcer le tableau
          storePhotos: [], // Initialiser le tableau
        };
        console.log("Données envoyées à Firestore (un magasin):", taskData);
        console.log("guidePhotos dans taskData:", taskData.guidePhotos, "Type:", Array.isArray(taskData.guidePhotos));
        await onAdd(taskData);
      }
      
      setForm(f=>({...f, title: "", notes: "", storeManager: ""}));
      setGuidePhotoFiles([]);
    } catch (error) {
      console.error("Erreur lors de la création:", error);
      alert("Erreur lors de la création du standard. Veuillez réessayer.");
    } finally {
      setIsUploading(false);
    }
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
          ℹ️ Le standard sera créé pour les {stores.length} magasins
        </div>
      )}
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label="Contrôleur" value={form.controller} onChange={v=>setForm(f=>({...f, controller:v}))} />
        {!form.allStores && (
          <Input label="Resp. magasin" value={form.storeManager} onChange={v=>setForm(f=>({...f, storeManager:v}))} />
        )}
      </div>
      <Input label="Standard demandé" value={form.title} onChange={v=>setForm(f=>({...f, title:v}))} placeholder="Ex.: Refaire facing rayon jeans" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label="Deadline" type="date" value={form.deadline} onChange={v=>setForm(f=>({...f, deadline:v}))} />
        <Textarea label="Commentaire VM" value={form.notes} onChange={v=>setForm(f=>({...f, notes:v}))} placeholder="Instructions, détails, consignes…" />
      </div>
      {(userRole === "admin" || userRole === "vm") && (
        <div>
          <label className="block text-sm mb-2">
            <span className="text-neutral-700">Photos standard de référence {userRole === "admin" ? "(Admin)" : "(VM)"}</span>
          </label>
          <div className="space-y-2">
            {guidePhotoFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {guidePhotoFiles.map((file, idx) => {
                  const url = URL.createObjectURL(file);
                  return (
                    <div key={idx} className="relative">
                      <img src={url} alt={`Guide ${idx + 1}`} className="w-20 h-20 object-cover rounded-lg border" />
                      <button
                        type="button"
                        onClick={() => {
                          URL.revokeObjectURL(url);
                          setGuidePhotoFiles(f => f.filter((_, i) => i !== idx));
                        }}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 text-xs"
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            <label className="block">
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  setGuidePhotoFiles(f => [...f, ...files]);
                  e.target.value = '';
                }}
                className="hidden"
              />
              <span className="px-3 py-2 rounded-xl border border-neutral-300 bg-white text-sm cursor-pointer hover:bg-neutral-50 inline-block">
                📸 Ajouter photos de référence
              </span>
            </label>
          </div>
        </div>
      )}
      <button 
        onClick={submit} 
        disabled={isUploading}
        className={clsx(
          "w-full py-2 rounded-xl text-white font-medium transition",
          isUploading 
            ? "bg-neutral-400 cursor-not-allowed" 
            : "bg-neutral-900 hover:bg-neutral-800"
        )}
      >
        {isUploading 
          ? "⏳ Chargement..." 
          : (form.allStores ? `Créer pour ${stores.length} magasins` : "Ajouter le standard")
        }
      </button>
    </div>
  );
}

function TaskTable({tasks, onUpdate, onDelete, userRole, onPhotoUpload, onPhotoRemove}){
  if(!tasks.length) return <p className="text-sm text-neutral-500 p-4">Aucun standard pour ces filtres.</p>;
  return (
    <>
      {/* Version mobile : Cartes */}
      <div className="md:hidden space-y-4">
        {tasks.map(t=> <TaskCard key={t.id} t={t} onUpdate={onUpdate} onDelete={onDelete} userRole={userRole} onPhotoUpload={onPhotoUpload} onPhotoRemove={onPhotoRemove} />)}
      </div>
      
      {/* Version desktop : Tableau */}
      <div className="hidden md:block overflow-auto border rounded-2xl">
        <table className="min-w-full text-sm">
          <thead className="bg-neutral-50">
            <tr>
              <Th>Magasin</Th>
              <Th>Standard</Th>
              <Th>Passage</Th>
              <Th>Deadline</Th>
              <Th>Statut</Th>
              {(userRole === "admin" || userRole === "vm") && <Th>Validation</Th>}
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {tasks.map(t=> <TaskRow key={t.id} t={t} onUpdate={onUpdate} onDelete={onDelete} userRole={userRole} onPhotoUpload={onPhotoUpload} onPhotoRemove={onPhotoRemove} />)}
          </tbody>
        </table>
      </div>
    </>
  );
}

function TaskCard({t, onUpdate, onDelete, userRole, onPhotoUpload, onPhotoRemove}){
  const overdue = useMemo(()=>{
    if(!t.deadline || t.status === 'Conforme') return false;
    const dl = new Date(t.deadline); if(isNaN(+dl)) return false;
    return dl < new Date();
  }, [t.deadline, t.status]);

  const canEditDeadline = userRole === "admin" || userRole === "vm";
  // S'assurer que guidePhotos est bien un tableau
  const guidePhotos = Array.isArray(t.guidePhotos) ? t.guidePhotos : (t.guidePhotos ? [t.guidePhotos] : []);
  const storePhotos = Array.isArray(t.storePhotos) ? t.storePhotos : (t.storePhotos ? [t.storePhotos] : []);
  const canAddPhoto = storePhotos.length < 5;

  return (
    <div className="bg-white border border-neutral-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow">
      {/* En-tête : Magasin */}
      <div className="mb-3 pb-3 border-b border-neutral-100">
        <div className="font-semibold text-base text-neutral-900">{t.store}</div>
        <div className="text-neutral-500 text-sm mt-0.5">{t.storeManager || "Resp. magasin ?"}</div>
      </div>

      {/* Standard principal */}
      <div className="mb-4">
        <div className="font-medium text-base text-neutral-900 mb-2 leading-relaxed">{t.title}</div>
        {t.notes && (
          <div className="text-neutral-600 text-sm mt-2 p-2 bg-neutral-50 rounded-lg">
            <strong className="text-neutral-700">Commentaire VM:</strong> {t.notes}
          </div>
        )}
        {t.feedbackMagasin && (
          <div className="text-blue-700 text-sm mt-2 p-2 bg-blue-50 rounded-lg">
            <strong>Retour magasin:</strong> {t.feedbackMagasin}
          </div>
        )}
        <div className="text-xs text-neutral-400 mt-2">Contrôleur: {t.controller || "—"}</div>
      </div>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <div className="text-xs text-neutral-500 mb-1">Date de passage</div>
          <div className="text-sm font-medium">{formatDate(t.date)}</div>
        </div>
        <div>
          <div className="text-xs text-neutral-500 mb-1">Deadline</div>
          {canEditDeadline ? (
            <input
              type="date"
              value={t.deadline || ''}
              onChange={(e) => onUpdate(t.id, {deadline: e.target.value})}
              className="w-full px-3 py-2 rounded-lg border border-neutral-300 bg-white text-sm"
            />
          ) : (
            <div className={clsx("text-sm font-medium", overdue ? "text-red-600" : "")}>
              {formatDate(t.deadline) || "—"}
            </div>
          )}
          {overdue && (
            <span className="text-xs bg-red-50 text-red-700 px-2 py-1 rounded-lg mt-1 inline-block">
              En retard
            </span>
          )}
        </div>
      </div>

      {/* Statut et Validation */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <div className="text-xs text-neutral-500 mb-1">Statut</div>
          <select 
            value={t.status} 
            onChange={e=>onUpdate(t.id,{status:e.target.value})} 
            className="w-full px-3 py-2 rounded-lg border border-neutral-300 bg-white text-sm"
          >
            {STATUSES.map(s=> <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        {(userRole === "admin" || userRole === "vm") && (
          <div>
            <div className="text-xs text-neutral-500 mb-1">Validation</div>
            <select 
              value={t.validation} 
              onChange={e=>onUpdate(t.id,{validation:e.target.value})} 
              className="w-full px-3 py-2 rounded-lg border border-neutral-300 bg-white text-sm"
            >
              {VALIDATIONS.map(v=> <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Photos guides - Affichage exactement comme les photos de conformité */}
      {guidePhotos && guidePhotos.length > 0 && (
        <div className="mb-4 pt-3 border-t border-neutral-100">
          <div className="text-xs text-neutral-500 mb-2 font-medium">📋 Standard de référence</div>
          <div className="flex flex-wrap gap-2">
            {guidePhotos.map((url, idx) => (
              <PhotoThumbnail key={`guide-${idx}`} url={url} onRemove={userRole === "admin" ? () => onPhotoRemove(t.id, url, true) : null} />
            ))}
          </div>
        </div>
      )}

      {/* Photos magasin */}
      {storePhotos.length > 0 && (
        <div className="mb-4 pt-3 border-t border-neutral-100">
          <div className="text-xs text-neutral-500 mb-2 font-medium">📸 Photos de conformité ({storePhotos.length}/5)</div>
          <div className="flex flex-wrap gap-2">
            {storePhotos.map((url, idx) => (
              <PhotoThumbnail key={`store-${idx}`} url={url} onRemove={() => onPhotoRemove(t.id, url, false)} />
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-2 pt-3 border-t border-neutral-100">
        <div className="flex items-center gap-2">
          <button 
            onClick={()=>onUpdate(t.id, {feedbackMagasin: prompt('Retour magasin sur ce standard', t.feedbackMagasin||'') ?? t.feedbackMagasin})} 
            className="flex-1 px-4 py-2 rounded-xl bg-neutral-100 text-neutral-700 hover:bg-neutral-200 text-sm font-medium transition"
          >
            💬 Retour magasin
          </button>
          {onDelete && (
            <button 
              onClick={()=>onDelete(t.id)} 
              className="px-4 py-2 rounded-xl bg-red-50 text-red-700 hover:bg-red-100 text-sm font-medium transition"
            >
              🗑️
            </button>
          )}
        </div>
        <div className="flex flex-col gap-2">
          {/* Bouton Photo de conformité (pour les magasins) */}
          {canAddPhoto && (
            <label className="w-full">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if(file) {
                    onPhotoUpload(t.id, file, false);
                  }
                  e.target.value = '';
                }}
                className="hidden"
              />
              <span className="block w-full px-4 py-2 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 text-sm font-medium transition text-center cursor-pointer">
                📸 Photo de conformité
              </span>
            </label>
          )}
          {!canAddPhoto && (
            <div className="text-xs text-neutral-500 text-center py-2">
              Maximum 5 photos de conformité atteint
            </div>
          )}
          
          {/* Bouton "Voir le standard de référence" - Pour TOUT LE MONDE si des photos existent */}
          {guidePhotos && guidePhotos.length > 0 && (
            <PhotoGalleryButton photos={guidePhotos} label="📋 Voir le standard de référence" />
          )}
          
          {/* Bouton "Ajouter photo standard de référence" - Pour Admin et VM si aucune photo n'existe */}
          {(userRole === "admin" || userRole === "vm") && (!guidePhotos || guidePhotos.length === 0) && (
            <label className="w-full">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if(file) {
                    onPhotoUpload(t.id, file, true);
                  }
                  e.target.value = '';
                }}
                className="hidden"
              />
              <span className="block w-full px-4 py-2 rounded-xl bg-purple-50 text-purple-700 hover:bg-purple-100 text-sm font-medium transition text-center cursor-pointer">
                📋 Ajouter photo standard de référence
              </span>
            </label>
          )}
          
          {/* Bouton "Ajouter" pour Admin et VM si des photos existent déjà (avec +) */}
          {(userRole === "admin" || userRole === "vm") && guidePhotos && guidePhotos.length > 0 && (
            <label className="w-full">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if(file) {
                    onPhotoUpload(t.id, file, true);
                  }
                  e.target.value = '';
                }}
                className="hidden"
              />
              <span className="block w-full px-4 py-2 rounded-xl bg-purple-50 text-purple-700 hover:bg-purple-100 text-sm font-medium transition text-center cursor-pointer">
                ➕ Ajouter une autre photo de référence
              </span>
            </label>
          )}
        </div>
      </div>
    </div>
  );
}

function TaskRow({t, onUpdate, onDelete, userRole, onPhotoUpload, onPhotoRemove}){
  const overdue = useMemo(()=>{
    if(!t.deadline || t.status === 'Conforme') return false;
    const dl = new Date(t.deadline); if(isNaN(+dl)) return false;
    return dl < new Date();
  }, [t.deadline, t.status]);

  const canEditDeadline = userRole === "admin" || userRole === "vm";
  const guidePhotos = t.guidePhotos || [];
  const storePhotos = t.storePhotos || [];
  const canAddPhoto = storePhotos.length < 5;
  const [showGallery, setShowGallery] = useState(false);

  return (
    <tr className="border-t hover:bg-neutral-50">
      <td className="align-top px-3 py-2 whitespace-nowrap">
        <div className="font-medium">{t.store}</div>
        <div className="text-neutral-500 text-xs">{t.storeManager || "Resp. magasin ?"}</div>
      </td>
      <td className="align-top px-3 py-2">
        <div className="font-medium">{t.title}</div>
        {guidePhotos.length > 0 && (
          <div className="mt-2">
            <div className="text-xs text-neutral-500 mb-1 font-medium">📋 Standards de référence</div>
            <div className="flex flex-wrap gap-1">
              {guidePhotos.map((url, idx) => (
                <PhotoThumbnail key={idx} url={url} onRemove={userRole === "admin" ? () => onPhotoRemove(t.id, url, true) : null} size="small" />
              ))}
            </div>
          </div>
        )}
        {t.notes && <div className="text-neutral-500 text-xs mt-1"><strong>Commentaire VM:</strong> {t.notes}</div>}
        {t.feedbackMagasin && <div className="text-blue-600 text-xs mt-1"><strong>Retour magasin:</strong> {t.feedbackMagasin}</div>}
        {storePhotos.length > 0 && (
          <div className="mt-2">
            <div className="text-xs text-neutral-500 mb-1 font-medium">📸 Photos ({storePhotos.length}/5)</div>
            <div className="flex flex-wrap gap-1">
              {storePhotos.map((url, idx) => (
                <PhotoThumbnail key={idx} url={url} onRemove={() => onPhotoRemove(t.id, url, false)} size="small" />
              ))}
            </div>
          </div>
        )}
        <div className="text-xs text-neutral-400 mt-1">Contrôleur: {t.controller || "—"}</div>
      </td>
      <td className="align-top px-3 py-2 whitespace-nowrap">{formatDate(t.date)}</td>
      <td className="align-top px-3 py-2 whitespace-nowrap">
        {canEditDeadline ? (
          <input
            type="date"
            value={t.deadline || ''}
            onChange={(e) => onUpdate(t.id, {deadline: e.target.value})}
            className="px-2 py-1 rounded-lg border bg-white text-xs"
          />
        ) : (
          <div className={clsx(overdue?"text-red-600 font-semibold":"")}>{formatDate(t.deadline) || "—"}</div>
        )}
        {overdue && <span className="text-xs bg-red-50 text-red-700 px-2 py-0.5 rounded-lg mt-1 inline-block">En retard</span>}
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
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <button 
              onClick={()=>onUpdate(t.id, {feedbackMagasin: prompt('Retour magasin sur ce standard', t.feedbackMagasin||'') ?? t.feedbackMagasin})} 
              className="px-2 py-1 rounded-lg bg-white border text-xs hover:bg-neutral-50"
              title="Ajouter un retour magasin"
            >
              💬
            </button>
            {canAddPhoto && (
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if(file) {
                      onPhotoUpload(t.id, file, false);
                    }
                    e.target.value = '';
                  }}
                  className="hidden"
                />
                <span className="px-2 py-1 rounded-lg bg-white border text-xs hover:bg-blue-50" title="Ajouter une photo de conformité">
                  📸
                </span>
              </label>
            )}
            {/* Bouton "Voir" pour TOUT LE MONDE si des photos existent */}
            {guidePhotos.length > 0 && (
              <>
                <button
                  onClick={() => setShowGallery(true)}
                  className="px-2 py-1 rounded-lg bg-purple-50 border border-purple-200 text-xs hover:bg-purple-100 text-purple-700"
                  title="Voir le standard de référence"
                >
                  👁️
                </button>
                {showGallery && (
                  <PhotoGalleryModal photos={guidePhotos} onClose={() => setShowGallery(false)} />
                )}
              </>
            )}
            {/* Bouton "Ajouter" pour Admin et VM si aucune photo n'existe */}
            {(userRole === "admin" || userRole === "vm") && guidePhotos.length === 0 && (
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if(file) {
                      onPhotoUpload(t.id, file, true);
                    }
                    e.target.value = '';
                  }}
                  className="hidden"
                />
                <span className="px-2 py-1 rounded-lg bg-white border text-xs hover:bg-purple-50" title="Ajouter une photo standard de référence">
                  📋
                </span>
              </label>
            )}
            {/* Bouton "Ajouter" pour Admin et VM si des photos existent déjà */}
            {(userRole === "admin" || userRole === "vm") && guidePhotos.length > 0 && (
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if(file) {
                      onPhotoUpload(t.id, file, true);
                    }
                    e.target.value = '';
                  }}
                  className="hidden"
                />
                <span className="px-2 py-1 rounded-lg bg-white border text-xs hover:bg-purple-50" title="Ajouter une autre photo de référence">
                  ➕
                </span>
              </label>
            )}
            {onDelete && (
              <button onClick={()=>onDelete(t.id)} className="px-2 py-1 rounded-lg bg-white border text-xs hover:bg-red-50">🗑️</button>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

function PhotoGalleryModal({photos, onClose}){
  const [currentIndex, setCurrentIndex] = useState(0);

  if(photos.length === 0) return null;

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center p-4" 
      onClick={onClose}
    >
      <div className="relative max-w-5xl max-h-[90vh] w-full h-full flex flex-col items-center justify-center">
        <img 
          src={photos[currentIndex]} 
          alt={`Photo ${currentIndex + 1} sur ${photos.length}`} 
          className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl mb-4" 
          onClick={(e) => e.stopPropagation()}
        />
        
        {/* Navigation */}
        {photos.length > 1 && (
          <div className="flex items-center gap-4 mb-4">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setCurrentIndex((prev) => (prev > 0 ? prev - 1 : photos.length - 1));
              }}
              className="px-4 py-2 bg-white text-black rounded-lg font-medium hover:bg-neutral-200 transition"
            >
              ← Précédent
            </button>
            <span className="text-white text-sm">
              {currentIndex + 1} / {photos.length}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setCurrentIndex((prev) => (prev < photos.length - 1 ? prev + 1 : 0));
              }}
              className="px-4 py-2 bg-white text-black rounded-lg font-medium hover:bg-neutral-200 transition"
            >
              Suivant →
            </button>
          </div>
        )}
        
        {/* Bouton fermer */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="absolute top-4 right-4 bg-white text-black rounded-full w-10 h-10 font-bold text-xl hover:bg-neutral-200 transition shadow-lg"
          title="Fermer"
        >
          ×
        </button>
      </div>
    </div>
  );
}

function PhotoGalleryButton({photos, label}){
  const [isOpen, setIsOpen] = useState(false);

  // Toujours afficher le bouton si photos existe et contient des éléments
  if(!photos || photos.length === 0){
    return null; // Ne rien afficher si aucune photo
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="w-full px-4 py-2 rounded-xl bg-purple-50 text-purple-700 hover:bg-purple-100 text-sm font-medium transition text-center"
      >
        {label} ({photos.length})
      </button>
      
      {isOpen && <PhotoGalleryModal photos={photos} onClose={() => setIsOpen(false)} />}
    </>
  );
}

function PhotoThumbnail({url, onRemove, size = "normal"}){
  const [isExpanded, setIsExpanded] = useState(false);
  const sizeClass = size === "small" ? "w-12 h-12" : "w-20 h-20";
  
  if(isExpanded){
    return (
      <div 
        className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center p-4" 
        onClick={() => setIsExpanded(false)}
      >
        <div className="relative max-w-5xl max-h-[90vh] w-full h-full flex items-center justify-center">
          <img 
            src={url} 
            alt="Photo en grand" 
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" 
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(false);
            }}
            className="absolute top-4 right-4 bg-white text-black rounded-full w-10 h-10 font-bold text-xl hover:bg-neutral-200 transition shadow-lg"
            title="Fermer"
          >
            ×
          </button>
          {onRemove && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if(window.confirm("Supprimer cette photo ?")) {
                  onRemove();
                  setIsExpanded(false);
                }
              }}
              className="absolute bottom-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-600 transition shadow-lg"
            >
              Supprimer
            </button>
          )}
        </div>
      </div>
    );
  }
  
  return (
    <div className="relative group">
      <img 
        src={url} 
        alt="Photo miniature" 
        className={`${sizeClass} object-cover rounded-lg border border-neutral-200 cursor-pointer hover:opacity-80 hover:scale-105 transition-all shadow-sm`}
        onClick={() => setIsExpanded(true)}
      />
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if(window.confirm("Supprimer cette photo ?")) {
              onRemove();
            }
          }}
          className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 text-xs opacity-0 group-hover:opacity-100 transition shadow-md hover:bg-red-600"
          title="Supprimer"
        >
          ×
        </button>
      )}
    </div>
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
