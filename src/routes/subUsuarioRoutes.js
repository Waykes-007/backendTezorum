// src/routes/subUsuarioRoutes.js
const express    = require('express')
const router     = express.Router()
const { createClient } = require('@supabase/supabase-js')

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

// POST /api/subusuarios/crear
router.post('/crear', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json({ error: 'No autorizado' })

  try {
    // Verificar token del vendedor
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
    if (tienda.plan !== 'oro') return res.status(403).json({ error: 'Solo el plan Oro puede agregar sub-usuarios' })

    // Verificar límite de 3 sub-usuarios
    const { count } = await supabaseAdmin
      .from('sub_usuarios').select('*', { count: 'exact', head: true }).eq('tienda_id', tiendaId)
    if (count >= 3) return res.status(400).json({ error: 'Alcanzaste el límite de 3 colaboradores' })

    // Crear usuario con signUp desde cliente temporal (no afecta sesión actual)
    const supabaseTemp = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    )
    const { data: authData, error: createErr } = await supabaseTemp.auth.signUp({
      email,
      password,
    })
    if (createErr) {
      if (createErr.message.toLowerCase().includes('already registered')) {
        return res.status(400).json({ error: 'Este correo ya está registrado en Waykes' })
      }
      throw createErr
    }

    const userId = authData?.user?.id ?? null

    // Insertar en sub_usuarios
    const { error: insertErr } = await supabaseAdmin.from('sub_usuarios').insert({
      tienda_id: tiendaId,
      user_id:   userId,
      nombre,
      email,
      roles,
      activo: true,
    })
    if (insertErr) throw insertErr

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

    const { data: sub } = await supabaseAdmin
      .from('sub_usuarios').select('user_id, tienda_id').eq('id', id).single()
    if (!sub) return res.status(404).json({ error: 'Sub-usuario no encontrado' })

    const { data: tienda } = await supabaseAdmin
      .from('tiendas').select('id').eq('id', sub.tienda_id).eq('user_id', user.id).single()
    if (!tienda) return res.status(403).json({ error: 'No tienes permiso' })

    // Eliminar de sub_usuarios (cascadea historial)
    await supabaseAdmin.from('sub_usuarios').delete().eq('id', id)

    return res.json({ message: 'Colaborador eliminado' })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
})

module.exports = routercd C:\tezorum\backend