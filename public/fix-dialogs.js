const fs = require('fs');
let code = fs.readFileSync('app.js', 'utf8');

// Insert custom dialog system
const dialogSys = `
// ========================
// CUSTOM DIALOG SYSTEM
// ========================
function showCustomDialog({ title, message, type = 'alert', inputValue = '' }) {
  return new Promise((resolve) => {
    const dialog = document.getElementById('custom-dialog');
    const titleEl = document.getElementById('dialog-title');
    const messageEl = document.getElementById('dialog-message');
    const inputContainer = document.getElementById('dialog-input-container');
    const inputEl = document.getElementById('dialog-input');
    const cancelBtn = document.getElementById('dialog-cancel-btn');
    const confirmBtn = document.getElementById('dialog-confirm-btn');

    titleEl.textContent = title;
    messageEl.innerText = message; 

    // Reset visibility
    inputContainer.classList.add('hidden');
    cancelBtn.classList.add('hidden');

    if (type === 'prompt') {
      inputContainer.classList.remove('hidden');
      inputEl.value = inputValue;
      cancelBtn.classList.remove('hidden');
    } else if (type === 'confirm') {
      cancelBtn.classList.remove('hidden');
    }

    const closeAndResolve = (val) => {
      dialog.classList.add('hidden');
      confirmBtn.onclick = null;
      cancelBtn.onclick = null;
      inputEl.onkeyup = null;
      resolve(val);
    };

    confirmBtn.onclick = () => {
      if (type === 'prompt') closeAndResolve(inputEl.value);
      else closeAndResolve(true);
    };

    cancelBtn.onclick = () => {
      if (type === 'prompt') closeAndResolve(null);
      else closeAndResolve(false);
    };

    if (type === 'prompt') {
      inputEl.onkeyup = (e) => {
        if (e.key === 'Enter') confirmBtn.click();
      };
    }

    dialog.classList.remove('hidden');
    if (type === 'prompt') { inputEl.focus(); inputEl.select(); }
    else confirmBtn.focus();
  });
}

const customAlert = (message, title = 'Aviso del Sistema') => showCustomDialog({ title, message, type: 'alert' });
const customConfirm = (message, title = 'Confirmar Acción') => showCustomDialog({ title, message, type: 'confirm' });
const customPrompt = (message, defaultValue = '', title = 'Ingresar Dato') => showCustomDialog({ title, message, type: 'prompt', inputValue: defaultValue });

// ========================
// RECURSOS DE UTILIDAD
`;

code = code.replace('// ========================\n// RECURSOS DE UTILIDAD', dialogSys);

// Replace confirm logic where it blocks inside async
code = code.replace("if (!confirm(`⚠️ ¿Estás seguro de ELIMINAR la obra \\\"\${name}\\\"?\\n\\nEsto borrará TODOS los trabajadores, días y adelantos asociados a esta obra. Esta acción NO se puede deshacer.\`)) return;", "if (!(await customConfirm(`⚠️ ¿Estás seguro de ELIMINAR la obra \\\"\${name}\\\"?\\n\\nEsto borrará TODOS los trabajadores, días y adelantos asociados a esta obra. Esta acción NO se puede deshacer.\`, 'Eliminar Obra Definitivamente'))) return;");

code = code.replace("if (!confirm('¿Seguro que deseas eliminar el trabajador? Esto borrará permanentemente sus registros de esta obra.')) return;", "if (!(await customConfirm('¿Seguro que deseas eliminar el trabajador? Esto borrará permanentemente sus registros de esta obra.', 'Eliminar Trabajador'))) return;");

code = code.replace('if(!confirm("¿Borrar este registro permanentemente?")) return;', 'if(!(await customConfirm("¿Borrar este registro permanentemente?", "Eliminar Registro"))) return;');

code = code.replace("if(!confirm(`¿Confirma que le ha pagado la nómina a todos entre el ${start_date} y el ${end_date}? \\nEsto guardará los registros en el historial y no volverán a aparecer en futuras liquidaciones.`)) return;", "if(!(await customConfirm(`¿Confirma que le ha pagado la nómina a todos entre el ${start_date} y el ${end_date}? \\nEsto guardará los registros en el historial y no volverán a aparecer en futuras liquidaciones.`, 'Cerrar Nómina de Este Periodo'))) return;");

code = code.replace('if(!confirm("¿Borrar gasto?")) return;', 'if(!(await customConfirm("¿Borrar gasto?", "Eliminar Gasto"))) return;');

// prompt logic
code = code.replace("const newName = prompt('Editar nombre de la obra:', currentName);", "const newName = await customPrompt('Editar nombre de la obra:', currentName, 'Editar Proyecto');");

// alert logic -> Just replace `alert(` with `customAlert(` globally.
code = code.replace(/alert\(/g, 'customAlert(');

fs.writeFileSync('app.js', code);
console.log('Dialogs fixed');
