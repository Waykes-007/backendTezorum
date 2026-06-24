const { activarPlanOro, degradarPlanClasico, PRECIOS } = require('../services/planService')
const supabase = require('../config/supabase')

const planController = {

  // GET /api/plan/precios
  async obtenerPrecios(req, res) {
    return res.json(PRECIOS)
  },

  // POST /api/plan/activar-oro
  // Body: { tiendaId, duracion }
  async activarOro(req, res) {
    const { tiendaId, duracion } = req.body
    if (!tiendaId || !duracion) {
      return res.status(400).json({ error: 'tiendaId y duracion son requeridos' })
    }
    try {
      const tienda = await activarPlanOro(tiendaId, duracion)
      return res.status(200).json({
        message: `Plan Oro activado para ${tienda.nombre_tienda}`,
        plan_fin: tienda.plan_fin,
      })
    } catch (err) {
      console.error('❌ activarOro:', err.message)
      return res.status(500).json({ error: err.message })
    }
  },

  // POST /api/plan/degradar
  // Body: { tiendaId }
  async degradar(req, res) {
    const { tiendaId } = req.body
    if (!tiendaId) return res.status(400).json({ error: 'tiendaId requerido' })
    try {
      await degradarPlanClasico(tiendaId)
      return res.status(200).json({ message: 'Plan degradado a Clásico' })
    } catch (err) {
      return res.status(500).json({ error: err.message })
    }
  },

  // GET /api/plan/estado/:tiendaId
  async obtenerEstado(req, res) {
    const { tiendaId } = req.params
    try {
      const { data, error } = await supabase
        .from('tiendas')
        .select('plan, plan_inicio, plan_fin, plan_duracion, plan_precio, es_vendedor_oro')
        .eq('id', tiendaId)
        .single()
      if (error) throw error
      return res.json(data)
    } catch (err) {
      return res.status(500).json({ error: err.message })
    }
  },
}

module.exports = planController