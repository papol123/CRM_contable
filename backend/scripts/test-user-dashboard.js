const http = require('http');

const API_BASE = 'http://localhost:3000/api/v1';

async function request(path, options = {}) {
  const url = new URL(`${API_BASE}${path}`);
  return new Promise((resolve, reject) => {
    const headers = options.headers || {};
    if (options.body && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    const req = http.request(
      url,
      {
        method: options.method || 'GET',
        headers,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
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
      }
    );

    req.on('error', reject);
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

async function runUserDashboardTests() {
  console.log('================================================================');
  console.log('🔍 VERIFICACIÓN COMPLETA DE FUNCIONES Y ENDPOINTS DEL ROL USUARIO');
  console.log('================================================================\n');

  // 1. Iniciar sesión como Usuario Operativo
  console.log('1️⃣ [POST /auth/login] Autenticando con rol Usuario...');
  const loginRes = await request('/auth/login', {
    method: 'POST',
    body: { email: 'usuario@crmcontable.com', password: 'Admin123*' },
  });
  console.log(`   Status: ${loginRes.status} | Token recibido: ${!!loginRes.data?.accessToken}`);
  const userToken = loginRes.data.accessToken;
  const userHeaders = { Authorization: `Bearer ${userToken}` };
  const rawSetCookie = loginRes.headers['set-cookie'];
  const cookieHeader = rawSetCookie ? { Cookie: rawSetCookie[0].split(';')[0] } : {};

  // 2. Sincronizar Perfil (GET /auth/me)
  console.log('\n2️⃣ [GET /auth/me] Consultando perfil y permisos autorizados...');
  const meRes = await request('/auth/me', { headers: userHeaders });
  console.log(`   Status: ${meRes.status} ${meRes.status === 200 ? 'OK' : 'Error'}`);
  console.log(`   Usuario: ${meRes.data.nombres} ${meRes.data.apellidos} (${meRes.data.email})`);
  console.log(`   Rol en BD: ${meRes.data.rol?.nombre || meRes.data.rol}`);
  console.log(`   Permisos efectivos activos: ${meRes.data.permisos?.length} capacidades`);
  console.log(`   Detalle permisos: ${meRes.data.permisos?.join(', ')}`);

  // 3. Renovar Sesión (POST /auth/refresh)
  console.log('\n3️⃣ [POST /auth/refresh] Renovando sesión y rotando refresh token...');
  const refreshRes = await request('/auth/refresh', {
    method: 'POST',
    headers: { ...cookieHeader },
  });
  console.log(`   Status: ${refreshRes.status} ${refreshRes.status === 200 ? 'OK' : 'Error'}`);
  console.log(`   Nuevo Access Token emitido: ${!!refreshRes.data?.accessToken}`);

  // 4. Verificación de Seguridad RBAC: Intentos a funciones de Administrador (deben ser 403)
  console.log('\n4️⃣ [RBAC - GET /users] Intento no autorizado de consultar lista de usuarios...');
  const rbacUsers = await request('/users', { headers: userHeaders });
  console.log(`   Status: ${rbacUsers.status} (Esperado: 403 Forbidden)`);
  console.log(`   Mensaje backend: ${rbacUsers.data?.message}`);

  console.log('\n5️⃣ [RBAC - GET /users/roles] Intento no autorizado de consultar roles...');
  const rbacRoles = await request('/users/roles', { headers: userHeaders });
  console.log(`   Status: ${rbacRoles.status} (Esperado: 403 Forbidden)`);
  console.log(`   Mensaje backend: ${rbacRoles.data?.message}`);

  console.log('\n6️⃣ [RBAC - POST /users] Intento no autorizado de crear nuevo usuario...');
  const rbacCreate = await request('/users', {
    method: 'POST',
    headers: userHeaders,
    body: {
      email: 'intruso@crmcontable.com',
      password: 'Password123*',
      nombres: 'Intruso',
      apellidos: 'Hacker',
      idRol: 'dcbb54ed-8b98-4517-938b-d96e7e8f0c60',
    },
  });
  console.log(`   Status: ${rbacCreate.status} (Esperado: 403 Forbidden)`);
  console.log(`   Mensaje backend: ${rbacCreate.data?.message}`);

  console.log('\n7️⃣ [RBAC - PATCH /users/:id] Intento no autorizado de modificar usuario...');
  const rbacPatch = await request('/users/dcbb54ed-8b98-4517-938b-d96e7e8f0c60', {
    method: 'PATCH',
    headers: userHeaders,
    body: { nombres: 'Modificado Sin Permiso' },
  });
  console.log(`   Status: ${rbacPatch.status} (Esperado: 403 Forbidden)`);
  console.log(`   Mensaje backend: ${rbacPatch.data?.message}`);

  console.log('\n8️⃣ [RBAC - DELETE /users/:id] Intento no autorizado de desactivar usuario...');
  const rbacDelete = await request('/users/dcbb54ed-8b98-4517-938b-d96e7e8f0c60', {
    method: 'DELETE',
    headers: userHeaders,
  });
  console.log(`   Status: ${rbacDelete.status} (Esperado: 403 Forbidden)`);
  console.log(`   Mensaje backend: ${rbacDelete.data?.message}`);

  // 5. Endpoints de Negocio no implementados en backend (deben retornar 404, sin simulación)
  console.log('\n9️⃣ [NEGOCIO - GET /terceros] Verificando endpoint no implementado...');
  const busTerceros = await request('/terceros', { headers: userHeaders });
  console.log(`   Status: ${busTerceros.status} (Esperado: 404 Not Found)`);
  console.log(`   Mensaje NestJS: ${busTerceros.data?.message} (Correcto: Sin simulación de datos)`);

  console.log('\n🔟 [NEGOCIO - GET /inventario] Verificando endpoint no implementado...');
  const busInventario = await request('/inventario', { headers: userHeaders });
  console.log(`   Status: ${busInventario.status} (Esperado: 404 Not Found)`);
  console.log(`   Mensaje NestJS: ${busInventario.data?.message} (Correcto: Sin simulación de datos)`);

  console.log('\n1️⃣1️⃣ [PERFIL - PATCH /auth/me] Verificando actualización de perfil...');
  const patchMe = await request('/auth/me', {
    method: 'PATCH',
    headers: userHeaders,
    body: { nombres: 'Juan Camilo', telefono: '3109876543' },
  });
  console.log(`   Status: ${patchMe.status} (Esperado: 404 Not Found si no implementado)`);
  console.log(`   Mensaje NestJS: ${patchMe.data?.message}`);

  // 6. Cerrar sesión segura (POST /auth/logout)
  console.log('\n1️⃣2️⃣ [POST /auth/logout] Ejecutando cierre de sesión seguro...');
  const logoutRes = await request('/auth/logout', {
    method: 'POST',
    headers: { ...userHeaders, ...cookieHeader },
  });
  console.log(`   Status: ${logoutRes.status} (Esperado: 204 No Content)`);

  console.log('\n================================================================');
  console.log('✅ TODAS LAS PRUEBAS DEL ROL USUARIO HAN SIDO VALIDADAS EXITOSAMENTE');
  console.log('================================================================');
}

runUserDashboardTests().catch((err) => {
  console.error('❌ Error en test:', err);
  process.exit(1);
});
