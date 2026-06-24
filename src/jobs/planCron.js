const cron = require('node-cron')
const { enviarAvisosVencimiento } = require('../services/planService')

function iniciarPlanCron() {
  // Cada día a las 00:01 AM hora Lima (UTC-5 = 05:01 UTC)
  cron.schedule('1 5 * * *', async () => {
    console.log('🕐 [planCron] Verificando avisos de vencimiento...')
    try {
      await enviarAvisosVencimiento()
    } catch (err) {
      console.error('❌ [planCron] Error:', err.message)
    }
  }, {
    timezone: 'America/Lima'
  })

  console.log('✅ [planCron] Cron de planes iniciado')
}

module.exports = { iniciarPlanCron }