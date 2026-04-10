<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// =======================
// SETUP & DATABASE
// =======================
$dbFile = __DIR__ . '/data.sqlite';
try {
    $pdo = new PDO('sqlite:' . $dbFile);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $pdo->exec('PRAGMA foreign_keys = ON;');
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database connection failed']);
    exit;
}

// =======================
// UTILS & JWT
// =======================
define('JWT_SECRET', 'super-secret-cuadrilla-2025');

function base64url_encode($data) {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}
function base64url_decode($data) {
    return base64_decode(strtr($data, '-_', '+/') . str_repeat('=', 3 - (3 + strlen($data)) % 4));
}
function generate_jwt($payload) {
    $header = json_encode(['typ' => 'JWT', 'alg' => 'HS256']);
    $payload['exp'] = time() + (7 * 24 * 60 * 60);
    $payload_json = json_encode($payload);
    $base64UrlHeader = base64url_encode($header);
    $base64UrlPayload = base64url_encode($payload_json);
    $signature = hash_hmac('sha256', $base64UrlHeader . "." . $base64UrlPayload, JWT_SECRET, true);
    $base64UrlSignature = base64url_encode($signature);
    return $base64UrlHeader . "." . $base64UrlPayload . "." . $base64UrlSignature;
}
function verify_jwt($token) {
    $parts = explode('.', $token);
    if (count($parts) !== 3) return false;
    list($base64UrlHeader, $base64UrlPayload, $base64UrlSignature) = $parts;
    $signature = base64url_decode($base64UrlSignature);
    $expected_signature = hash_hmac('sha256', $base64UrlHeader . "." . $base64UrlPayload, JWT_SECRET, true);
    if (hash_equals($signature, $expected_signature)) {
        $payload = json_decode(base64url_decode($base64UrlPayload), true);
        if (isset($payload['exp']) && $payload['exp'] < time()) return false;
        return $payload;
    }
    return false;
}
function json_resp($data, $status = 200) {
    http_response_code($status);
    echo json_encode($data);
    exit;
}
function require_auth() {
    $headers = null;
    if (function_exists('apache_request_headers')) {
        $headers = apache_request_headers();
    } else {
        $headers = array();
        foreach ($_SERVER as $key => $value) {
            if (substr($key, 0, 5) == 'HTTP_') {
                $header = str_replace(' ', '-', ucwords(str_replace('_', ' ', strtolower(substr($key, 5)))));
                $headers[$header] = $value;
            }
        }
    }
    
    $headers = array_change_key_case($headers, CASE_LOWER);

    $authHeader = isset($headers['authorization']) ? $headers['authorization'] : '';
    $token = str_replace('Bearer ', '', trim($authHeader));
    if (empty($token) && isset($headers['x-auth-token'])) {
        $token = trim($headers['x-auth-token']);
    }
    if (!$token) json_resp(['error' => 'Token requerido'], 401);
    
    $user = verify_jwt($token);
    if (!$user) json_resp(['error' => 'Token inválido'], 401);
    return $user;
}

// =======================
// ROUTER
// =======================
$rutaRaw = isset($_GET['ruta']) ? $_GET['ruta'] : '';
$parsed = parse_url($rutaRaw);
$ruta = '/' . trim($parsed['path'] ?? '', '/');
if ($ruta === '/') $ruta = '';
if (isset($parsed['query'])) {
    parse_str($parsed['query'], $query_params);
    $_GET = array_merge($_GET, $query_params);
}
$method = $_SERVER['REQUEST_METHOD'];
$body = json_decode(file_get_contents('php://input'), true) ?: [];
$segments = explode('/', trim($ruta, '/'));

try {
    // ---- AUTH ----
    if ($ruta === '/login' && $method === 'POST') {
        $username = trim($body['username'] ?? '');
        $password = $body['password'] ?? '';
        if (!$username || !$password) json_resp(['error' => 'Usuario y contraseña son obligatorios'], 400);

        $stmt = $pdo->prepare("SELECT * FROM users WHERE username = ?");
        $stmt->execute([$username]);
        $user = $stmt->fetch();

        if (!$user || !password_verify($password, $user['password_hash'])) {
            json_resp(['error' => 'Usuario o contraseña incorrectos'], 400);
        }
        $token = generate_jwt(['id' => $user['id'], 'username' => $user['username']]);
        json_resp(['token' => $token]);
    }

    if ($ruta === '/users/register' && $method === 'POST') {
        require_auth();
        $username = trim($body['username'] ?? '');
        $password = $body['password'] ?? '';
        if (!$username || !$password) json_resp(['error' => 'Obligatorios'], 400);
        
        $hash = password_hash($password, PASSWORD_BCRYPT);
        try {
            $stmt = $pdo->prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)");
            $stmt->execute([$username, $hash]);
            json_resp(['ok' => true, 'message' => 'Usuario creado exitosamente']);
        } catch (Exception $e) {
            json_resp(['error' => 'El usuario ya existe (o error BD)'], 400);
        }
    }

    // ---- PROJECTS ----
    if ($ruta === '/projects' && $method === 'GET') {
        require_auth();
        $stmt = $pdo->query("SELECT id, name FROM projects ORDER BY id");
        json_resp($stmt->fetchAll());
    }
    if ($ruta === '/projects' && $method === 'POST') {
        require_auth();
        $name = trim($body['name'] ?? '');
        if (!$name) json_resp(['error' => 'El nombre de la obra es obligatorio'], 400);
        $stmt = $pdo->prepare("INSERT INTO projects (name) VALUES (?)");
        $stmt->execute([$name]);
        json_resp(['id' => $pdo->lastInsertId(), 'name' => $name]);
    }
    if ($segments[0] === 'projects' && isset($segments[1]) && !isset($segments[2]) && $method === 'PUT') {
        require_auth();
        $id = (int)$segments[1];
        $name = trim($body['name'] ?? '');
        if (!$name) json_resp(['error' => 'El nombre de la obra es obligatorio'], 400);
        $stmt = $pdo->prepare("UPDATE projects SET name = ? WHERE id = ?");
        $stmt->execute([$name, $id]);
        json_resp(['ok' => true]);
    }
    if ($segments[0] === 'projects' && isset($segments[1]) && !isset($segments[2]) && $method === 'DELETE') {
        require_auth();
        $id = (int)$segments[1];
        $pdo->prepare("DELETE FROM work_entries WHERE project_id = ?")->execute([$id]);
        $pdo->prepare("DELETE FROM advances WHERE project_id = ?")->execute([$id]);
        $pdo->prepare("DELETE FROM workers WHERE project_id = ?")->execute([$id]);
        $pdo->prepare("DELETE FROM projects WHERE id = ?")->execute([$id]);
        json_resp(['ok' => true]);
    }

    // ---- WORKERS ----
    if ($ruta === '/workers' && $method === 'GET') {
        require_auth();
        $project_id = (int)($_GET['project_id'] ?? 0);
        if (!$project_id) json_resp(['error' => 'project_id es obligatorio'], 400);
        $stmt = $pdo->prepare("SELECT id, project_id, name, document, rate_per_day, role FROM workers WHERE project_id = ? ORDER BY id");
        $stmt->execute([$project_id]);
        json_resp($stmt->fetchAll());
    }
    if ($ruta === '/workers' && $method === 'POST') {
        require_auth();
        $project_id = $body['project_id'] ?? 0;
        $name = trim($body['name'] ?? '');
        $document = $body['document'] ?? '';
        $rate = (float)($body['rate_per_day'] ?? 0);
        $role = $body['role'] ?? 'Ayudante';
        if (!$project_id || !$name || !$rate) json_resp(['error' => 'Faltan datos'], 400);
        
        $stmt = $pdo->prepare("INSERT INTO workers (project_id, name, document, rate_per_day, role) VALUES (?, ?, ?, ?, ?)");
        $stmt->execute([$project_id, $name, $document, $rate, $role]);
        json_resp([
            'id' => $pdo->lastInsertId(), 'project_id' => $project_id, 
            'name' => $name, 'document' => $document, 'rate_per_day' => $rate, 'role' => $role
        ]);
    }
    if ($segments[0] === 'workers' && isset($segments[1]) && !isset($segments[2]) && $method === 'PUT') {
        require_auth();
        $id = (int)$segments[1];
        $name = trim($body['name'] ?? '');
        $document = $body['document'] ?? '';
        $rate = (float)($body['rate_per_day'] ?? 0);
        $role = $body['role'] ?? 'Ayudante';
        if (!$name || !$rate) json_resp(['error' => 'Faltan datos'], 400);
        
        $stmt = $pdo->prepare("UPDATE workers SET name = ?, document = ?, rate_per_day = ?, role = ? WHERE id = ?");
        $stmt->execute([$name, $document, $rate, $role, $id]);
        json_resp(['ok' => true]);
    }
    if ($segments[0] === 'workers' && isset($segments[1]) && !isset($segments[2]) && $method === 'DELETE') {
        require_auth();
        $id = (int)$segments[1];
        $pdo->prepare("DELETE FROM work_entries WHERE worker_id = ?")->execute([$id]);
        $pdo->prepare("DELETE FROM advances WHERE worker_id = ?")->execute([$id]);
        $pdo->prepare("DELETE FROM workers WHERE id = ?")->execute([$id]);
        json_resp(['ok' => true]);
    }
    if ($segments[0] === 'workers' && isset($segments[1]) && isset($segments[2]) && $segments[2] === 'work_entries' && $method === 'GET') {
        require_auth();
        $id = (int)$segments[1];
        $stmt = $pdo->prepare("SELECT id, date, days_worked FROM work_entries WHERE worker_id = ? ORDER BY date");
        $stmt->execute([$id]);
        json_resp($stmt->fetchAll());
    }
    if ($segments[0] === 'workers' && isset($segments[1]) && isset($segments[2]) && $segments[2] === 'advances' && $method === 'GET') {
        require_auth();
        $id = (int)$segments[1];
        $stmt = $pdo->prepare("SELECT id, date, amount FROM advances WHERE worker_id = ? ORDER BY date");
        $stmt->execute([$id]);
        json_resp($stmt->fetchAll());
    }

    // ---- WORK ENTRIES & ADVANCES ----
    if ($ruta === '/work_entries' && $method === 'POST') {
        require_auth();
        if (!isset($body['worker_id'], $body['project_id'], $body['date'], $body['days'])) json_resp(['error' => 'Faltan datos'], 400);
        $stmt = $pdo->prepare("INSERT INTO work_entries (worker_id, project_id, date, days_worked) VALUES (?, ?, ?, ?)");
        $stmt->execute([$body['worker_id'], $body['project_id'], $body['date'], (float)$body['days']]);
        json_resp(['ok' => true, 'id' => $pdo->lastInsertId()]);
    }
    if ($ruta === '/advances' && $method === 'POST') {
        require_auth();
        if (!isset($body['worker_id'], $body['project_id'], $body['date'], $body['amount'])) json_resp(['error' => 'Faltan datos'], 400);
        $stmt = $pdo->prepare("INSERT INTO advances (worker_id, project_id, date, amount) VALUES (?, ?, ?, ?)");
        $stmt->execute([$body['worker_id'], $body['project_id'], $body['date'], (float)$body['amount']]);
        json_resp(['ok' => true, 'id' => $pdo->lastInsertId()]);
    }
    if ($segments[0] === 'work_entries' && isset($segments[1]) && $method === 'DELETE') {
        require_auth();
        $pdo->prepare("DELETE FROM work_entries WHERE id = ?")->execute([(int)$segments[1]]);
        json_resp(['ok' => true]);
    }
    if ($segments[0] === 'advances' && isset($segments[1]) && $method === 'DELETE') {
        require_auth();
        $pdo->prepare("DELETE FROM advances WHERE id = ?")->execute([(int)$segments[1]]);
        json_resp(['ok' => true]);
    }

    // ---- PAYROLL GENERATE ----
    if ($ruta === '/payroll/generate' && $method === 'POST') {
        require_auth();
        if (!isset($body['project_id'], $body['start_date'], $body['end_date'])) json_resp(['error' => 'Faltan datos'], 400);
        $pid = $body['project_id']; $sd = $body['start_date']; $ed = $body['end_date'];
        
        $stmt = $pdo->prepare("SELECT id, name FROM projects WHERE id = ?");
        $stmt->execute([$pid]);
        $project = $stmt->fetch();
        if (!$project) json_resp(['error' => 'Obra no encontrada'], 400);

        $sql = "
        SELECT
            w.id AS worker_id, w.name, w.rate_per_day,
            (SELECT COALESCE(SUM(we.days_worked), 0) FROM work_entries we WHERE we.worker_id = w.id AND we.project_id = :p1 AND we.date BETWEEN :sd1 AND :ed1 AND we.is_paid = 0) AS total_days,
            (SELECT COALESCE(SUM(we.days_worked * w.rate_per_day), 0) FROM work_entries we WHERE we.worker_id = w.id AND we.project_id = :p2 AND we.date BETWEEN :sd2 AND :ed2 AND we.is_paid = 0) AS total_pay,
            (SELECT COALESCE(SUM(a.amount), 0) FROM advances a WHERE a.worker_id = w.id AND a.project_id = :p3 AND a.date BETWEEN :sd3 AND :ed3 AND a.is_paid = 0) AS total_advances
        FROM workers w WHERE w.project_id = :p4 ORDER BY w.name
        ";
        $stmt2 = $pdo->prepare($sql);
        $stmt2->execute([
            ':p1' => $pid, ':sd1' => $sd, ':ed1' => $ed,
            ':p2' => $pid, ':sd2' => $sd, ':ed2' => $ed,
            ':p3' => $pid, ':sd3' => $sd, ':ed3' => $ed,
            ':p4' => $pid
        ]);
        $rows = $stmt2->fetchAll();

        $workers = [];
        $totals = ['total_gross' => 0, 'total_advances' => 0, 'total_net' => 0];
        foreach ($rows as $r) {
            $gross = (float)$r['total_pay'];
            $adv = (float)$r['total_advances'];
            $net = $gross - $adv;
            $workers[] = [
                'worker_id' => (int)$r['worker_id'], 'name' => $r['name'], 'rate_per_day' => (float)$r['rate_per_day'],
                'total_days' => (float)$r['total_days'], 'gross' => $gross, 'advances' => $adv, 'net' => $net
            ];
            $totals['total_gross'] += $gross;
            $totals['total_advances'] += $adv;
            $totals['total_net'] += $net;
        }
        json_resp(['project' => $project, 'start_date' => $sd, 'end_date' => $ed, 'workers' => $workers, 'totals' => $totals]);
    }

    if ($ruta === '/payroll/clear_debt' && $method === 'POST') {
        require_auth();
        $pid = $body['project_id']; $sd = $body['start_date']; $ed = $body['end_date'];
        $pdo->prepare("UPDATE work_entries SET is_paid = 1 WHERE project_id = ? AND date BETWEEN ? AND ?")->execute([$pid, $sd, $ed]);
        $pdo->prepare("UPDATE advances SET is_paid = 1 WHERE project_id = ? AND date BETWEEN ? AND ?")->execute([$pid, $sd, $ed]);
        json_resp(['ok' => true]);
    }

    // ---- EXPENSES ----
    if ($segments[0] === 'projects' && isset($segments[1]) && isset($segments[2]) && $segments[2] === 'expenses' && $method === 'GET') {
        require_auth();
        $id = (int)$segments[1];
        $stmt = $pdo->prepare("SELECT * FROM expenses WHERE project_id = ? ORDER BY date DESC, id DESC");
        $stmt->execute([$id]);
        json_resp($stmt->fetchAll());
    }
    if ($ruta === '/expenses' && $method === 'POST') {
        require_auth();
        if (!isset($body['project_id'], $body['date'], $body['description'], $body['amount'])) json_resp(['error' => 'Faltan error'], 400);
        $stmt = $pdo->prepare("INSERT INTO expenses (project_id, date, description, amount) VALUES (?, ?, ?, ?)");
        $stmt->execute([$body['project_id'], $body['date'], trim($body['description']), (float)$body['amount']]);
        json_resp(['ok' => true, 'id' => $pdo->lastInsertId()]);
    }
    if ($segments[0] === 'expenses' && isset($segments[1]) && $method === 'DELETE') {
        require_auth();
        $pdo->prepare("DELETE FROM expenses WHERE id = ?")->execute([(int)$segments[1]]);
        json_resp(['ok' => true]);
    }

    // ---- STATS ----
    if ($ruta === '/stats' && $method === 'GET') {
        require_auth();
        $sql = "SELECT p.id, p.name,
              (SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE project_id = p.id) AS total_expenses,
              (SELECT COALESCE(SUM(we.days_worked * w.rate_per_day), 0) FROM work_entries we JOIN workers w ON we.worker_id = w.id WHERE we.project_id = p.id) AS total_payroll
            FROM projects p";
        $stmt = $pdo->query($sql);
        $rows = $stmt->fetchAll();
        foreach($rows as &$row) {
            $row['total_expenses'] = (float)$row['total_expenses'];
            $row['total_payroll'] = (float)$row['total_payroll'];
        }
        json_resp($rows);
    }

    // ---- SEARCH ----
    if ($ruta === '/search_workers' && $method === 'GET') {
        require_auth();
        $q = trim($_GET['q'] ?? '');
        if (!$q) json_resp([]);
        $likeQ = "%$q%";
        $sql = "
            SELECT 
              w.id, w.name, w.document, w.role, w.rate_per_day, w.project_id,
              p.name AS project_name,
              (SELECT COALESCE(SUM(we.days_worked * w.rate_per_day), 0) FROM work_entries we WHERE we.worker_id = w.id AND we.is_paid = 0) AS pending_gross,
              (SELECT COALESCE(SUM(a.amount), 0) FROM advances a WHERE a.worker_id = w.id AND a.is_paid = 0) AS pending_advances,
              (SELECT GROUP_CONCAT(date, ', ') FROM work_entries we WHERE we.worker_id = w.id AND we.is_paid = 0) AS recent_dates
            FROM workers w JOIN projects p ON w.project_id = p.id
            WHERE w.name LIKE ? OR w.document LIKE ? ORDER BY w.name
        ";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$likeQ, $likeQ]);
        $rows = $stmt->fetchAll();
        $mapped = [];
        foreach($rows as $r) {
            $mapped[] = [
                'id' => $r['id'], 'name' => $r['name'], 'document' => $r['document'], 'role' => $r['role'],
                'project_id' => $r['project_id'], 'project_name' => $r['project_name'],
                'recent_dates' => $r['recent_dates'] ?: 'Sin días',
                'net_pay' => (float)$r['pending_gross'] - (float)$r['pending_advances']
            ];
        }
        json_resp($mapped);
    }

    // Si no encuentra ruta
    json_resp(['error' => 'Endpoint no encontrado (PHP): ' . $ruta], 404);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Error interno del servidor PHP', 'details' => $e->getMessage()]);
}
?>
