const Contact = require('../models/Contact');
const { logActivity } = require('../services/activityLogger');

const getContacts = async (req, res) => {
    try {
        const userId = req.user.id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const skip = (page - 1) * limit;

        const [contacts, total] = await Promise.all([
            Contact.find({ userId })
                .skip(skip)
                .limit(limit)
                .sort({ createdAt: -1 }),
            Contact.countDocuments({ userId })
        ]);

        res.status(200).json({
            success: true,
            contacts,
            total,
            page,
            pages: Math.ceil(total / limit) || 1
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Failed to fetch contacts' });
    }
};

const uploadContacts = async (req, res) => {
    try {
        const userId = req.user.id;
        const { contacts } = req.body; // Array of { phone, name }

        if (!Array.isArray(contacts)) {
            return res.status(400).json({ success: false, error: 'Invalid payload' });
        }

        let imported = 0;
        let duplicates = 0;

        // Process in chunks or individually to handle duplicates gracefully
        for (const contact of contacts) {
            try {
                if (!contact.phone) continue;
                // Clean phone number (strip non-digits)
                const phone = String(contact.phone).replace(/[^0-9]/g, '');
                if (!phone) continue;

                await Contact.create({
                    userId,
                    phone,
                    name: contact.name || null
                });
                imported++;
            } catch (err) {
                // If unique constraint fails, it's a duplicate
                if (err.code === 11000) {
                    duplicates++;
                }
            }
        }

        if (imported > 0) {
            logActivity(userId, 'contacts_uploaded', { imported, duplicates });
        }

        res.status(200).json({ success: true, imported, duplicates });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Failed to upload contacts' });
    }
};

const exportContacts = async (req, res) => {
    try {
        const userId = req.user.id;
        const contacts = await Contact.find({ userId })
            .sort({ createdAt: -1 });

        let csv = "phone,name\n";
        contacts.forEach(c => {
            csv += `${c.phone},${c.name || ''}\n`;
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=contacts-${Date.now()}.csv`);
        res.status(200).send(csv);
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Failed to export contacts' });
    }
};

const deleteAllContacts = async (req, res) => {
    try {
        const userId = req.user.id;
        await Contact.deleteMany({ userId });

        res.status(200).json({ success: true, message: 'All contacts deleted' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Failed to delete contacts' });
    }
};

const getAllContactNumbers = async (req, res) => {
    // For filling the campaign form quickly without pagination
    try {
        const userId = req.user.id;
        const contacts = await Contact.find({ userId })
            .select('phone -_id');
        
        res.status(200).json({ success: true, numbers: contacts.map(c => c.phone) });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to fetch' });
    }
}

module.exports = {
    getContacts,
    uploadContacts,
    exportContacts,
    deleteAllContacts,
    getAllContactNumbers
};
