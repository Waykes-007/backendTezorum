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
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token)
    if (authErr || !user) return res.status(401).json({ error: 'Token inválido' })

    const { tiendaId, nombre, email, password, roles } = req.body
    if (!tiendaId || !nombre || !email || !password || !roles?.length) {
      return res.status(400).json({ error: 'Faltan campos requeridos' })
    }

    // Verificar que la tienda pertenece al vendedor y es plan Oro
    const { data: tienda, error: tiendaErr } = await supabaseAdmin
      .from('tiendas').select('id, plan').eq('id', tiendaId).eq('user_id', user.id).single()
    if (tiendaErr || !tienda) return res.status(403).json({ error: 'No tienes permiso sobre esta tienda' })
    if (tienda.plan !== 'oro') return res.status(403).json({ error: 'Solo el plan Oro puede agregar sub-usuarios' })

    // Verificar límite de 3 sub-usuarios
    const { count } = await supabaseAdmin
      .from('sub_usuarios').select('*', { count: 'exact', head: true }).eq('tienda_id', tiendaId)
    if (count >= 3) return res.status(400).json({ error: 'Alcanzaste el límite de 3 colaboradores' })

    // Verificar si el correo ya existe en sub_usuarios
    const { data: subExiste } = await supabaseAdmin
      .from('sub_usuarios').select('id').eq('email', email).maybeSingle()
    if (subExiste) {
      return res.status(400).json({ error: 'Este correo ya está registrado como colaborador' })
    }

    // Buscar si el correo ya existe en auth.users via RPC
    const { data: existingUserId, error: rpcErr } = await supabaseAdmin
      .rpc('get_user_id_by_email', { p_email: email })

    let userId = existingUserId ?? null

    if (!userId) {
      // Crear usuario nuevo con cliente temporal
      const supabaseTemp = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY
      )
      const { data: authData, error: createErr } = await supabaseTemp.auth.signUp({ email, password })
      if (createErr) throw createErr
      userId = authData?.user?.id ?? null
    }

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
// No eliminamos de auth.users — solo de sub_usuarios
// El correo queda libre para ser reutilizado si se vuelve a agregar
router.delete('/:id', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json({ error: 'No autorizado' })

  try {
    const { data: { user } } = await supabaseAdmin.auth.getUser(token)
    if (!user) return res.status(401).json({ error: 'Token inválido' })

    const { id } = req.params

    const { data: sub } = await supabaseAdmin
      .from('sub_usuarios').select('user_id, tienda_id, email').eq('id', id).single()
    if (!sub) return res.status(404).json({ error: 'Sub-usuario no encontrado' })

    const { data: tienda } = await supabaseAdmin
      .from('tiendas').select('id').eq('id', sub.tienda_id).eq('user_id', user.id).single()
    if (!tienda) return res.status(403).json({ error: 'No tienes permiso' })

    // Solo eliminar de sub_usuarios — el usuario de auth queda para reutilizar
    await supabaseAdmin.from('sub_usuarios').delete().eq('id', id)

    return res.json({ message: 'Colaborador eliminado' })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
})

module.exports = router