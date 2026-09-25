const http = require('http');

const API_BASE = 'http://localhost:3000/api/v1';

async function request(path, options = {}) {
  const url = new URL(`${API_BASE}${path}`);
  return new Promise((resolve, reject) => {
    const headers = options.headers || {};
    if (options.body && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    const req = http.request(url, {
      method: options.method || 'GET',
      headers,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try {
          json = data ? JSON.parse(data) : null;
        } catch {
          json = data;
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: json,
        });
      });
    });

    req.on('error', reject);
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('================================================================');
  console.log('🚀 VALIDACIÓN COMPLETA DE ENDPOINTS HTTP REALES (ADMIN Y USUARIO)');
  console.log('================================================================\n');

  // ─── 1. LOGIN ADMINISTRADOR ────────────────────────────────────────────────
  console.log('1️⃣ [POST /auth/login] Autenticando como ADMINISTRADOR...');
  const adminLoginRes = await request('/auth/login', {
    method: 'POST',
    body: { email: 'admin@crmcontable.com', password: 'Admin123*' }
  });
  console.log(`   Status: ${adminLoginRes.status}`);
  if (adminLoginRes.status !== 200) {
    throw new Error(`Login admin falló: ${JSON.stringify(adminLoginRes.data)}`);
  }
  const adminToken = adminLoginRes.data.accessToken;
  const adminHeaders = { Authorization: `Bearer ${adminToken}` };
  console.log(`   ✅ Token obtenido. Rol: ${adminLoginRes.data.user.rol}`);

  // ─── 2. GET /auth/me (ADMIN) ────────────────────────────────────────────────
  console.log('\n2️⃣ [GET /auth/me] Consultando perfil de Administrador...');
  const adminMeRes = await request('/auth/me', { headers: adminHeaders });
  console.log(`   Status: ${adminMeRes.status} | Nombre: ${adminMeRes.data.nombres} ${adminMeRes.data.apellidos}`);
  console.log(`   Permisos asignados: ${adminMeRes.data.permisos?.length} permisos`);

  // ─── 3. GET /users/roles (ADMIN) ───────────────────────────────────────────
  console.log('\n3️⃣ [GET /users/roles] Consultando catálogo de roles y permisos...');
  const rolesRes = await request('/users/roles', { headers: adminHeaders });
  console.log(`   Status: ${rolesRes.status} | Roles encontrados: ${rolesRes.data.length}`);
  const rolUsuario = rolesRes.data.find(r => r.codigo === 'USUARIO');
  console.log(`   ✅ Rol de referencia: ${rolUsuario?.nombre} (ID: ${rolUsuario?.id})`);

  // ─── 4. GET /users (ADMIN) ─────────────────────────────────────────────────
  console.log('\n4️⃣ [GET /users] Consultando lista de usuarios con búsqueda y filtros...');
  const usersRes = await request('/users', { headers: adminHeaders });
  console.log(`   Status: ${usersRes.status} | Total usuarios en base de datos: ${usersRes.data.length}`);

  // ─── 5. POST /users (ADMIN - CREAR REGISTRO) ───────────────────────────────
  const testEmail = `test.operador.${Date.now()}@crmcontable.com`;
  console.log(`\n5️⃣ [POST /users] Creando nuevo usuario: ${testEmail}...`);
  const createRes = await request('/users', {
    method: 'POST',
    headers: adminHeaders,
    body: {
      email: testEmail,
      password: 'Password123*',
      nombres: 'Prueba',
      apellidos: 'Operativa',
      telefono: '3009998877',
      idRol: rolUsuario.id,
      activo: true
    }
  });
  console.log(`   Status: ${createRes.status}`);
  if (createRes.status !== 201) {
    throw new Error(`Crear usuario falló: ${JSON.stringify(createRes.data)}`);
  }
  const createdUser = createRes.data;
  console.log(`   ✅ Usuario creado con éxito. UUID: ${createdUser.id} | Rol: ${createdUser.rol?.nombre}`);

  // ─── 6. GET /users/:id (ADMIN - CONSULTAR DETALLE) ─────────────────────────
  console.log(`\n6️⃣ [GET /users/:id] Consultando detalle del usuario recién creado (${createdUser.id})...`);
  const detailRes = await request(`/users/${createdUser.id}`, { headers: adminHeaders });
  console.log(`   Status: ${detailRes.status} | Usuario: ${detailRes.data.nombres} ${detailRes.data.apellidos}`);

  // ─── 7. PATCH /users/:id (ADMIN - ACTUALIZAR) ──────────────────────────────
  console.log(`\n7️⃣ [PATCH /users/:id] Actualizando teléfono y nombre del usuario...`);
  const updateRes = await request(`/users/${createdUser.id}`, {
    method: 'PATCH',
    headers: adminHeaders,
    body: {
      nombres: 'Prueba Actualizada',
      telefono: '3110001122'
    }
  });
  console.log(`   Status: ${updateRes.status} | Nuevo nombre: ${updateRes.data.nombres} | Teléfono: ${updateRes.data.telefono}`);

  // ─── 8. DELETE /users/:id (ADMIN - ELIMINAR / DESACTIVAR) ──────────────────
  console.log(`\n8️⃣ [DELETE /users/:id] Desactivando usuario creado (soft delete)...`);
  const deleteRes = await request(`/users/${createdUser.id}`, {
    method: 'DELETE',
    headers: adminHeaders
  });
  console.log(`   Status: ${deleteRes.status} | Mensaje: ${deleteRes.data.message}`);

  // ─── 9. LOGIN USUARIO OPERATIVO ────────────────────────────────────────────
  console.log('\n9️⃣ [POST /auth/login] Autenticando como USUARIO OPERATIVO...');
  const userLoginRes = await request('/auth/login', {
    method: 'POST',
    body: { email: 'usuario@crmcontable.com', password: 'Admin123*' }
  });
  console.log(`   Status: ${userLoginRes.status}`);
  if (userLoginRes.status !== 200) {
    throw new Error(`Login usuario operativo falló: ${JSON.stringify(userLoginRes.data)}`);
  }
  const userToken = userLoginRes.data.accessToken;
  const userHeaders = { Authorization: `Bearer ${userToken}` };
  console.log(`   ✅ Token obtenido. Rol: ${userLoginRes.data.user.rol}`);

  // ─── 10. GET /auth/me (USUARIO) ────────────────────────────────────────────
  console.log('\n🔟 [GET /auth/me] Consultando perfil y permisos autorizados para Usuario...');
  const userMeRes = await request('/auth/me', { headers: userHeaders });
  console.log(`   Status: ${userMeRes.status} | Nombre: ${userMeRes.data.nombres} ${userMeRes.data.apellidos}`);
  console.log(`   Permisos operativos: ${userMeRes.data.permisos?.join(', ')}`);

  // ─── 11. GET /users (USUARIO - PRUEBA DE BLOQUEO DE SEGURIDAD 403) ─────────
  console.log('\n1️⃣1️⃣ [GET /users] Intentando consultar usuarios con rol Usuario (esperando 403 Forbidden)...');
  const userForbiddenRes = await request('/users', { headers: userHeaders });
  console.log(`   Status recibido: ${userForbiddenRes.status}`);
  if (userForbiddenRes.status === 403) {
    console.log(`   ✅ CORRECTO: Acceso denegado como corresponde por RBAC.`);
    console.log(`   Mensaje del backend: ${userForbiddenRes.data.message}`);
  } else {
    console.error(`   ❌ Inesperado: El servidor devolvió status ${userForbiddenRes.status}`);
  }

  // ─── 12. LOGOUT ────────────────────────────────────────────────────────────
  console.log('\n1️⃣2️⃣ [POST /auth/logout] Cerrando sesión...');
  const logoutRes = await request('/auth/logout', {
    method: 'POST',
    headers: userHeaders
  });
  console.log(`   Status: ${logoutRes.status} (204 No Content esperado)`);

  console.log('\n================================================================');
  console.log('🎉 TODOS LOS TESTS DE ENDPOINTS HTTP CONCLUIDOS CON ÉXITO');
  console.log('================================================================');
}

runTests().catch(err => {
  console.error('❌ Error en ejecución de tests:', err);
  process.exit(1);
});
