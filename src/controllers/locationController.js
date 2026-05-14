const supabase = require('../config/supabase');

const locationController = {
    async getDepartamentos(req, res) {
        const { data, error } = await supabase
            .from('departamentos')
            .select('*')
            .order('departamento');
        if (error) return res.status(500).json(error);
        res.json(data);
    },

    async getProvincias(req, res) {
        const { depId } = req.params;
        const { data, error } = await supabase
            .from('provincias')
            .select('*')
            .eq('departamento_id', depId)
            .order('provincia');
        if (error) return res.status(500).json(error);
        res.json(data);
    },

    async getDistritos(req, res) {
        const { provId } = req.params;
        const { data, error } = await supabase
            .from('distritos')
            .select('*')
            .eq('provincia_id', provId)
            .order('distrito');
        if (error) return res.status(500).json(error);
        res.json(data);
    }
};

module.exports = locationController;