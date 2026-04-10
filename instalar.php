<?php
header('Content-Type: text/html; charset=utf-8');

$dbFile = __DIR__ . '/data.sqlite';
$sqlFile = __DIR__ . '/migrations.sql';

echo "<h1>🛠️ Instalación de Base de Datos para Costruker</h1>";

if (!file_exists($sqlFile)) {
    die("❌ Error: No se encuentra el archivo migrations.sql");
}

try {
    $pdo = new PDO('sqlite:' . $dbFile);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    // Ejecutar migraciones
    $sql = file_get_contents($sqlFile);
    $pdo->exec($sql);
    echo "✅ Tablas creadas correctamente.<br>";
    
    // Función para crear usuario si no existe
    function ensureUser($pdo, $username, $password) {
        $stmt = $pdo->prepare("SELECT id FROM users WHERE username = ?");
        $stmt->execute([$username]);
        if (!$stmt->fetch()) {
            $hash = password_hash($password, PASSWORD_BCRYPT);
            $insert = $pdo->prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)");
            $insert->execute([$username, $hash]);
            echo "✅ Usuario '$username' creado.<br>";
        } else {
            echo "⚠️ Usuario '$username' ya existe.<br>";
        }
    }

    // Crear usuarios por defecto (igual que en Node.js)
    ensureUser($pdo, 'admin', 'Admin123!');
    ensureUser($pdo, 'Elver', 'Elver80.');
    ensureUser($pdo, 'Kevinriv', '687524');
    
    echo "<br><h2 style='color:green;'>🎉 Instalación Completada con Éxito.</h2>";
    echo "<p>Ya puedes volver a <a href='index.html'>index.html</a> e iniciar sesión.</p>";
    echo "<p><small>Por seguridad, puedes borrar este archivo instalar.php cuando termines.</small></p>";
    
} catch (Exception $e) {
    echo "❌ <b>Error de Base de Datos:</b> " . $e->getMessage();
}
?>
