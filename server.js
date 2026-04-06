// backend/server.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { db, runSqlFile } = require('./database');

const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-cuadrilla-2025'; // Default for local only
const MIGRATIONS_FILE = path.join(__dirname, 'migrations.sql');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// =============== AUTH ===============
function auth(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token = header.replace('Bearer ', '').trim();

  if (!token) {
    return res.status(401).json({ error: 'Token requerido' });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token inválido' });
  }
}

// =============== LOGIN ===============
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña son obligatorios' });
  }

  db.get(
    'SELECT * FROM users WHERE username = ?',
    [username],
    async (err, user) => {
      if (err) {
        console.error('Error buscando usuario:', err);
        return res.status(500).json({ error: 'Error interno' });
      }
      if (!user) {
        return res.status(400).json({ error: 'Usuario o contraseña incorrectos' });
      }

      const ok = await bcrypt.compare(password, user.password_hash);
      if (!ok) {
        return res.status(400).json({ error: 'Usuario o contraseña incorrectos' });
      }

      const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, {
        expiresIn: '7d',
      });

      res.json({ token });
    }
  );
});

// =============== REGISTER ADMIN (Crear otro user) ===============
app.post('/api/users/register', auth, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña son obligatorios' });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    db.run(
      'INSERT INTO users (username, password_hash) VALUES (?, ?)',
      [username.trim(), hash],
      function (err) {
        if (err) {
          if (err.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ error: 'El usuario ya existe' });
          }
          console.error('Error creando usuario:', err);
          return res.status(500).json({ error: 'Error interno en BD' });
        }
        res.json({ ok: true, message: 'Usuario creado exitosamente' });
      }
    );
  } catch (err) {
    console.error('Error de encriptación:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// =============== PROJECTS (OBRAS) ===============
app.get('/api/projects', auth, (req, res) => {
  db.all('SELECT id, name FROM projects ORDER BY id', [], (err, rows) => {
    if (err) {
      console.error('Error obteniendo obras:', err);
      return res.status(500).json({ error: 'Error obteniendo obras' });
    }
    res.json(rows);
  });
});

app.post('/api/projects', auth, (req, res) => {
  const { name } = req.body || {};
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'El nombre de la obra es obligatorio' });
  }
  db.run(
    'INSERT INTO projects (name) VALUES (?)',
    [name.trim()],
    function (err) {
      if (err) {
        console.error('Error creando obra:', err);
        return res.status(500).json({ error: 'Error creando obra' });
      }
      res.json({ id: this.lastID, name: name.trim() });
    }
  );
});

app.put('/api/projects/:id', auth, (req, res) => {
  const projectId = Number(req.params.id);
  const { name } = req.body || {};
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'El nombre de la obra es obligatorio' });
  }
  db.run(
    'UPDATE projects SET name = ? WHERE id = ?',
    [name.trim(), projectId],
    function (err) {
      if (err) {
        console.error('Error actualizando obra:', err);
        return res.status(500).json({ error: 'Error actualizando obra' });
      }
      res.json({ ok: true });
    }
  );
});

app.delete('/api/projects/:id', auth, (req, res) => {
  const projectId = Number(req.params.id);

  db.serialize(() => {
    db.run('DELETE FROM work_entries WHERE project_id = ?', [projectId]);
    db.run('DELETE FROM advances     WHERE project_id = ?', [projectId]);
    db.run('DELETE FROM workers      WHERE project_id = ?', [projectId]);
    db.run('DELETE FROM projects     WHERE id = ?', [projectId], function (err) {
      if (err) {
        console.error('Error borrando obra:', err);
        return res.status(500).json({ error: 'Error borrando obra' });
      }
      res.json({ ok: true });
    });
  });
});

// =============== WORKERS (TRABAJADORES) ===============
app.get('/api/workers', auth, (req, res) => {
  const projectId = Number(req.query.project_id);
  if (!projectId) {
    return res.status(400).json({ error: 'project_id es obligatorio' });
  }

  db.all(
    'SELECT id, project_id, name, document, rate_per_day, role FROM workers WHERE project_id = ? ORDER BY id',
    [projectId],
    (err, rows) => {
      if (err) {
        console.error('Error obteniendo trabajadores:', err);
        return res.status(500).json({ error: 'Error obteniendo trabajadores' });
      }
      res.json(rows);
    }
  );
});

app.post('/api/workers', auth, (req, res) => {
  const { project_id, name, document, rate_per_day, role } = req.body || {};
  if (!project_id || !name || !rate_per_day) {
    return res.status(400).json({ error: 'project_id, nombre y valor día son obligatorios' });
  }

  db.run(
    'INSERT INTO workers (project_id, name, document, rate_per_day, role) VALUES (?, ?, ?, ?, ?)',
    [project_id, name.trim(), document || '', Number(rate_per_day), role || 'Ayudante'],
    function (err) {
      if (err) {
        console.error('Error creando trabajador:', err);
        return res.status(500).json({ error: 'Error creando trabajador' });
      }
      res.json({
        id: this.lastID,
        project_id,
        name: name.trim(),
        document: document || '',
        rate_per_day: Number(rate_per_day),
        role: role || 'Ayudante',
      });
    }
  );
});

app.put('/api/workers/:id', auth, (req, res) => {
  const workerId = Number(req.params.id);
  const { name, document, rate_per_day, role } = req.body || {};
  if (!name || !rate_per_day) {
    return res.status(400).json({ error: 'Nombre y valor día son obligatorios' });
  }

  db.run(
    'UPDATE workers SET name = ?, document = ?, rate_per_day = ?, role = ? WHERE id = ?',
    [name.trim(), document || '', Number(rate_per_day), role || 'Ayudante', workerId],
    function (err) {
      if (err) {
        console.error('Error actualizando trabajador:', err);
        return res.status(500).json({ error: 'Error actualizando trabajador' });
      }
      res.json({ ok: true });
    }
  );
});

app.delete('/api/workers/:id', auth, (req, res) => {
  const workerId = Number(req.params.id);

  db.serialize(() => {
    db.run('DELETE FROM work_entries WHERE worker_id = ?', [workerId]);
    db.run('DELETE FROM advances     WHERE worker_id = ?', [workerId]);
    db.run('DELETE FROM workers      WHERE id = ?', [workerId], function (err) {
      if (err) {
        console.error('Error eliminando trabajador:', err);
        return res.status(500).json({ error: 'Error eliminando trabajador' });
      }
      res.json({ ok: true });
    });
  });
});

// =============== OBTENER DÍAS TRABAJADOS DE UN TRABAJADOR ===============
app.get('/api/workers/:id/work_entries', auth, (req, res) => {
  const workerId = Number(req.params.id);

  db.all(
    'SELECT id, date, days_worked FROM work_entries WHERE worker_id = ? ORDER BY date',
    [workerId],
    (err, rows) => {
      if (err) {
        console.error('Error obteniendo días trabajados:', err);
        return res.status(500).json({ error: 'Error obteniendo días trabajados' });
      }
      res.json(rows);
    }
  );
});

// =============== OBTENER ADELANTOS DE UN TRABAJADOR ===============
app.get('/api/workers/:id/advances', auth, (req, res) => {
  const workerId = Number(req.params.id);

  db.all(
    'SELECT id, date, amount FROM advances WHERE worker_id = ? ORDER BY date',
    [workerId],
    (err, rows) => {
      if (err) {
        console.error('Error obteniendo adelantos:', err);
        return res.status(500).json({ error: 'Error obteniendo adelantos' });
      }
      res.json(rows);
    }
  );
});

// =============== REGISTRO DE DÍAS (work_entries) ===============
app.post('/api/work_entries', auth, (req, res) => {
  const { worker_id, project_id, date, days } = req.body || {};

  if (!worker_id || !project_id || !date || !days) {
    return res.status(400).json({ error: 'worker_id, project_id, date y days son obligatorios' });
  }

  db.run(
    'INSERT INTO work_entries (worker_id, project_id, date, days_worked) VALUES (?, ?, ?, ?)',
    [worker_id, project_id, date, Number(days)],
    function (err) {
      if (err) {
        console.error('Error registrando día:', err);
        return res.status(500).json({ error: 'Error registrando día' });
      }
      res.json({ ok: true, id: this.lastID });
    }
  );
});

// =============== REGISTRO DE ADELANTOS ===============
app.post('/api/advances', auth, (req, res) => {
  const { worker_id, project_id, date, amount } = req.body || {};

  if (!worker_id || !project_id || !date || !amount) {
    return res
      .status(400)
      .json({ error: 'worker_id, project_id, date y amount son obligatorios' });
  }

  db.run(
    'INSERT INTO advances (worker_id, project_id, date, amount) VALUES (?, ?, ?, ?)',
    [worker_id, project_id, date, Number(amount)],
    function (err) {
      if (err) {
        console.error('Error registrando adelanto:', err);
        return res.status(500).json({ error: 'Error registrando adelanto' });
      }
      res.json({ ok: true, id: this.lastID });
    }
  );
});

// =============== GENERAR NÓMINA ===============
app.post('/api/payroll/generate', auth, (req, res) => {
  const { project_id, start_date, end_date } = req.body || {};

  if (!project_id || !start_date || !end_date) {
    return res
      .status(400)
      .json({ error: 'project_id, start_date y end_date son obligatorios' });
  }

  db.get(
    'SELECT id, name FROM projects WHERE id = ?',
    [project_id],
    (err, project) => {
      if (err) {
        console.error('Error obteniendo obra:', err);
        return res.status(500).json({ error: 'Error obteniendo obra' });
      }
      if (!project) {
        return res.status(400).json({ error: 'Obra no encontrada' });
      }

      const sql = `
        SELECT
          w.id AS worker_id,
          w.name,
          w.rate_per_day,
          (
            SELECT COALESCE(SUM(we.days_worked), 0) 
            FROM work_entries we 
            WHERE we.worker_id = w.id 
              AND we.project_id = ? 
              AND we.date BETWEEN ? AND ?
              AND we.is_paid = 0
          ) AS total_days,
          (
            SELECT COALESCE(SUM(we.days_worked * w.rate_per_day), 0) 
            FROM work_entries we 
            WHERE we.worker_id = w.id 
              AND we.project_id = ? 
              AND we.date BETWEEN ? AND ?
              AND we.is_paid = 0
          ) AS total_pay,
          (
            SELECT COALESCE(SUM(a.amount), 0) 
            FROM advances a 
            WHERE a.worker_id = w.id 
              AND a.project_id = ? 
              AND a.date BETWEEN ? AND ?
              AND a.is_paid = 0
          ) AS total_advances
        FROM workers w
        WHERE w.project_id = ?
        ORDER BY w.name
      `;

      db.all(
        sql,
        [
          project_id, start_date, end_date, // Para total_days
          project_id, start_date, end_date, // Para total_pay
          project_id, start_date, end_date, // Para total_advances
          project_id                        // Para la condición w.project_id
        ],
        (err2, rows) => {
          if (err2) {
            console.error('Error generando nómina:', err2);
            return res.status(500).json({ error: 'Error generando nómina' });
          }

          const workers = rows.map((r) => {
            const gross = Number(r.total_pay || 0);
            const adv = Number(r.total_advances || 0);
            const net = gross - adv;

            return {
              worker_id: r.worker_id,
              name: r.name,
              rate_per_day: Number(r.rate_per_day),
              total_days: Number(r.total_days),
              gross,
              advances: adv,
              net,
            };
          });

          const totals = workers.reduce(
            (acc, w) => {
              acc.total_gross += w.gross;
              acc.total_advances += w.advances;
              acc.total_net += w.net;
              return acc;
            },
            { total_gross: 0, total_advances: 0, total_net: 0 }
          );

          res.json({
            project,
            start_date,
            end_date,
            workers,
            totals,
          });
        }
      );
    }
  );
});

// =============== LIMPIAR DEUDA / MARCAR PAGADA ===============
app.post('/api/payroll/clear_debt', auth, (req, res) => {
  const { project_id, start_date, end_date } = req.body || {};
  if (!project_id || !start_date || !end_date) {
    return res
      .status(400)
      .json({ error: 'project_id, start_date y end_date son obligatorios' });
  }

  db.serialize(() => {
    db.run(
      'UPDATE work_entries SET is_paid = 1 WHERE project_id = ? AND date BETWEEN ? AND ?',
      [project_id, start_date, end_date],
      (err) => {
        if (err) {
          console.error('Error pagando días del rango:', err);
          return res.status(500).json({ error: 'Error limpiando días del rango' });
        }

        db.run(
          'UPDATE advances SET is_paid = 1 WHERE project_id = ? AND date BETWEEN ? AND ?',
          [project_id, start_date, end_date],
          (err2) => {
            if (err2) {
              console.error('Error pagando adelantos del rango:', err2);
              return res.status(500).json({ error: 'Error limpiando adelantos del rango' });
            }

            res.json({ ok: true });
          }
        );
      }
    );
  });
});

// =============== BORRAR ADELANTOS ===============
app.post('/api/payroll/clear_advances', auth, (req, res) => {
  const { project_id, start_date, end_date } = req.body || {};
  if (!project_id || !start_date || !end_date) {
    return res
      .status(400)
      .json({ error: 'project_id, start_date y end_date son obligatorios' });
  }

  db.run(
    'DELETE FROM advances WHERE project_id = ? AND date BETWEEN ? AND ?',
    [project_id, start_date, end_date],
    function (err) {
      if (err) {
        console.error('Error borrando adelantos:', err);
        return res.status(500).json({ error: 'Error borrando adelantos' });
      }
      res.json({ ok: true });
    }
  );
});

// =============== BORRAR DÍAS TRABAJADOS ===============
app.post('/api/payroll/clear_work_entries', auth, (req, res) => {
  const { project_id, start_date, end_date } = req.body || {};
  if (!project_id || !start_date || !end_date) {
    return res
      .status(400)
      .json({ error: 'project_id, start_date y end_date son obligatorios' });
  }

  db.run(
    'DELETE FROM work_entries WHERE project_id = ? AND date BETWEEN ? AND ?',
    [project_id, start_date, end_date],
    function (err) {
      if (err) {
        console.error('Error borrando días trabajados:', err);
        return res.status(500).json({ error: 'Error borrando días trabajados' });
      }
      res.json({ ok: true });
    }
  );
});

// =============== BORRAR REGISTROS INDIVIDUALES (HISTORIAL) ===============
app.delete('/api/work_entries/:id', auth, (req, res) => {
  db.run('DELETE FROM work_entries WHERE id = ?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: 'Error borrando día' });
    res.json({ ok: true });
  });
});

app.delete('/api/advances/:id', auth, (req, res) => {
  db.run('DELETE FROM advances WHERE id = ?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: 'Error borrando adelanto' });
    res.json({ ok: true });
  });
});

// =============== GASTOS (EXPENSES) ===============
app.get('/api/projects/:id/expenses', auth, (req, res) => {
  db.all(
    'SELECT * FROM expenses WHERE project_id = ? ORDER BY date DESC, id DESC',
    [req.params.id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Error obteniendo gastos' });
      res.json(rows);
    }
  );
});

app.post('/api/expenses', auth, (req, res) => {
  const { project_id, date, description, amount } = req.body || {};
  if (!project_id || !date || !description || !amount) {
    return res.status(400).json({ error: 'Faltan datos de gasto' });
  }
  db.run(
    'INSERT INTO expenses (project_id, date, description, amount) VALUES (?, ?, ?, ?)',
    [project_id, date, description.trim(), Number(amount)],
    function (err) {
      if (err) return res.status(500).json({ error: 'Error creando gasto' });
      res.json({ ok: true, id: this.lastID });
    }
  );
});

app.delete('/api/expenses/:id', auth, (req, res) => {
  db.run('DELETE FROM expenses WHERE id = ?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: 'Error borrando gasto' });
    res.json({ ok: true });
  });
});

// =============== DASHBOARD STATS ===============
app.get('/api/stats', auth, (req, res) => {
  const sql = `
    SELECT 
      p.id, 
      p.name,
      (SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE project_id = p.id) AS total_expenses,
      (SELECT COALESCE(SUM(we.days_worked * w.rate_per_day), 0) 
       FROM work_entries we 
       JOIN workers w ON we.worker_id = w.id 
       WHERE we.project_id = p.id) AS total_payroll
    FROM projects p
  `;
  
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Error obteniendo estadisticas' });
    res.json(rows);
  });
});

// =============== BUSCADOR GLOBAL ===============
app.get('/api/search_workers', auth, (req, res) => {
  const q = req.query.q || '';
  if (!q.trim()) return res.json([]);
  
  const likeQ = `%${q.trim()}%`;
  
  const sql = `
    SELECT 
      w.id, w.name, w.document, w.role, w.rate_per_day, w.project_id,
      p.name AS project_name,
      (
        SELECT COALESCE(SUM(we.days_worked * w.rate_per_day), 0) 
        FROM work_entries we 
        WHERE we.worker_id = w.id AND we.is_paid = 0
      ) AS pending_gross,
      (
        SELECT COALESCE(SUM(a.amount), 0) 
        FROM advances a 
        WHERE a.worker_id = w.id AND a.is_paid = 0
      ) AS pending_advances,
      (
        SELECT GROUP_CONCAT(date, ', ') 
        FROM work_entries we 
        WHERE we.worker_id = w.id AND we.is_paid = 0
      ) AS recent_dates
    FROM workers w
    JOIN projects p ON w.project_id = p.id
    WHERE w.name LIKE ? OR w.document LIKE ?
    ORDER BY w.name
  `;
  
  db.all(sql, [likeQ, likeQ], (err, rows) => {
    if(err) {
       console.error('Error global search:', err);
       return res.status(500).json({error: 'Error buscando'});
    }
    
    // Mapear saldos netos
    const mapped = rows.map(r => {
      return {
        id: r.id,
        name: r.name,
        document: r.document,
        role: r.role,
        project_id: r.project_id,
        project_name: r.project_name,
        recent_dates: r.recent_dates || 'Sin días',
        net_pay: r.pending_gross - r.pending_advances
      };
    });
    
    res.json(mapped);
  });
});

// =============== ARRANQUE: MIGRACIONES Y ADMIN ===============
function ensureAdmin() {
  db.get('SELECT id FROM users WHERE username = ?', ['admin'], async (err, row) => {
    if (err) {
      console.error('Error revisando admin:', err);
      return;
    }
    if (row) return;

    const password = 'Admin123!';
    const hash = await bcrypt.hash(password, 10);

    db.run(
      'INSERT INTO users (username, password_hash) VALUES (?, ?)',
      ['admin', hash],
      function (err2) {
        if (err2) {
          console.error('Error creando admin:', err2);
        } else {
          console.log(`Admin creado: user=admin, pass=${password}`);
        }
      }
    );
  });
}

runSqlFile(MIGRATIONS_FILE)
  .then(() => {
    console.log('Migraciones completas.');
    ensureAdmin();
    app.listen(PORT, () => {
      console.log(`\n  🏗️  COSTRUKER - Sistema de Gestión de Obras`);
      console.log(`  ------------------------------------------`);
      console.log(`  🚀 Servidor Master activo -> http://localhost:${PORT}\n`);
    });
  })
  .catch((err) => {
    console.error('Error ejecutando migraciones:', err);
    process.exit(1);
  });
