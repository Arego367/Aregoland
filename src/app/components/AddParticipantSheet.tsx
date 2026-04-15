/**
 * AddParticipantSheet — Bottom-Sheet Kontaktliste zum Hinzufügen von
 * Teilnehmern während eines laufenden Anrufs.
 *
 * Zeigt alle gespeicherten Kontakte (ohne bereits im Call befindliche),
 * mit Suchfilter. Bei Auswahl wird onSelect(contact) aufgerufen.
 */

import { useState, useMemo } from 'react';
import { X, Search, UserPlus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { loadContacts, type StoredContact } from '@/app/auth/contacts';

interface AddParticipantSheetProps {
  open: boolean;
  onClose: () => void;
  onSelect: (contact: StoredContact) => void;
  /** AregoIDs der bereits im Call befindlichen Teilnehmer (werden ausgeblendet) */
  excludeIds?: string[];
}

export default function AddParticipantSheet({
  open, onClose, onSelect, excludeIds = [],
}: AddParticipantSheetProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');

  const contacts = useMemo(() => {
    const all = loadContacts();
    const excluded = new Set(excludeIds);
    return all.filter(c => !excluded.has(c.aregoId));
  }, [excludeIds, open]); // reload when sheet opens

  const filtered = useMemo(() => {
    if (!search.trim()) return contacts;
    const q = search.toLowerCase();
    return contacts.filter(c => c.displayName.toLowerCase().includes(q));
  }, [contacts, search]);

  if (!open) return null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[110] flex items-end justify-center bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="w-full max-w-lg bg-gray-900 rounded-t-2xl border-t border-gray-700 max-h-[70vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <h3 className="text-white font-bold text-base">{t('call.addParticipant')}</h3>
              <button
                onClick={onClose}
                className="p-2 rounded-full text-gray-400 hover:bg-gray-800 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Suchfeld */}
            <div className="px-4 pb-3">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder={t('call.searchContacts')}
                  className="w-full pl-9 pr-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
                  autoFocus
                />
              </div>
            </div>

            {/* Kontaktliste */}
            <div className="flex-1 overflow-y-auto px-2 pb-6">
              {filtered.length === 0 ? (
                <p className="text-center text-gray-500 text-sm py-8">
                  {search.trim() ? t('call.noContactsFound') : t('call.noContacts')}
                </p>
              ) : (
                filtered.map(contact => (
                  <button
                    key={contact.aregoId}
                    onClick={() => {
                      onSelect(contact);
                      onClose();
                    }}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-gray-800 transition-colors text-left"
                  >
                    {/* Avatar: Initialen */}
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
                      {contact.displayName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">{contact.displayName}</p>
                      <p className="text-gray-500 text-xs truncate">{contact.aregoId.slice(0, 12)}...</p>
                    </div>
                    <UserPlus size={18} className="text-gray-500 shrink-0" />
                  </button>
                ))
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
