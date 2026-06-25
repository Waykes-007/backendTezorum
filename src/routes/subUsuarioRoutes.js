// src/routes/subUsuarioRoutes.js
const express    = require('express')
const router     = express.Router()
const { soloAdmin } = require('../middlewares/authMiddleware')
const { createClient } = require('@supabase/supabase-js')

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

// POST /api/subusuarios/crear
// Body: { tiendaId, nombre, email, password, roles }
// Auth: token del vendedor principal
router.post('/crear', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json({ error: 'No autorizado' })

  try {
    // Verificar que el token pertenece al dueño de la tienda
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token)
    if (authErr || !user) return res.status(401).json({ error: 'Token inválido' })

    const { tiendaId, nombre, email, password, roles } = req.body
    if (!tiendaId || !nombre || !email || !password || !roles?.length) {
      return res.status(400).json({ error: 'Faltan campos requeridos' })
    }

    // Verificar que la tienda pertenece al vendedor
    const { data: tienda, error: tiendaErr } = await supabaseAdmin
      .from('tiendas').select('id, plan').eq('id', tiendaId).eq('user_id', user.id).single()
    if (tiendaErr || !tienda) return res.status(403).json({ error: 'No tienes permiso sobre esta tienda' })
    if (tienda.plan !== 'oro')  return res.status(403).json({ error: 'Solo el plan Oro puede agregar sub-usuarios' })

    // Verificar límite de 3 sub-usuarios
    const { count } = await supabaseAdmin
      .from('sub_usuarios').select('*', { count: 'exact', head: true }).eq('tienda_id', tiendaId)
    if (count >= 3) return res.status(400).json({ error: 'Alcanzaste el límite de 3 colaboradores' })

    // Crear usuario en Supabase Auth con service role (no afecta sesión actual)
    const { data: authData, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Confirmar email automáticamente
    })
    if (createErr) {
      if (createErr.message.includes('already registered')) {
        return res.status(400).json({ error: 'Este correo ya está registrado en Waykes' })
      }
      throw createErr
    }

    const userId = authData.user.id

    // Insertar en sub_usuarios
    const { error: insertErr } = await supabaseAdmin.from('sub_usuarios').insert({
      tienda_id: tiendaId,
      user_id:   userId,
      nombre,
      email,
      roles,
      activo: true,
    })
    if (insertErr) {
      // Rollback: eliminar usuario de auth si falla el insert
      await supabaseAdmin.auth.admin.deleteUser(userId)
      throw insertErr
    }

    return res.status(201).json({ message: `Colaborador ${nombre} creado exitosamente` })
  } catch (err) {
    console.error('❌ crear sub-usuario:', err.message)
    return res.status(500).json({ error: err.message })
  }
})

// DELETE /api/subusuarios/:id
router.delete('/:id', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json({ error: 'No autorizado' })

  try {
    const { data: { user } } = await supabaseAdmin.auth.getUser(token)
    if (!user) return res.status(401).json({ error: 'Token inválido' })

    const { id } = req.params

    // Verificar que el sub-usuario pertenece a una tienda del vendedor
    const { data: sub } = await supabaseAdmin
      .from('sub_usuarios').select('user_id, tienda_id').eq('id', id).single()
    if (!sub) return res.status(404).json({ error: 'Sub-usuario no encontrado' })

    const { data: tienda } = await supabaseAdmin
      .from('tiendas').select('id').eq('id', sub.tienda_id).eq('user_id', user.id).single()
    if (!tienda) return res.status(403).json({ error: 'No tienes permiso' })

    // Eliminar de auth si tiene user_id
    if (sub.user_id) {
      await supabaseAdmin.auth.admin.deleteUser(sub.user_id)
    }

    // Eliminar de sub_usuarios (cascadea historial)
    await supabaseAdmin.from('sub_usuarios').delete().eq('id', id)

    return res.json({ message: 'Colaborador eliminado' })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
})

module.exports = router