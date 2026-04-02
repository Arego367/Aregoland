import * as Dialog from "@radix-ui/react-dialog";
import { X, Trash2, Save, ArrowUp, ArrowDown, Plus, Eye, EyeOff } from "lucide-react";
import { useState, useEffect } from "react";
import { useTranslation } from 'react-i18next';
import { Tab } from "../types";

interface TabManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  tabs: Tab[];
  onUpdateTabs: (tabs: Tab[]) => void;
}

export function TabManagementModal({ isOpen, onClose, tabs, onUpdateTabs }: TabManagementModalProps) {
  const { t } = useTranslation();
  const [editedTabs, setEditedTabs] = useState<Tab[]>(tabs);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    setEditedTabs(tabs);
  }, [tabs]);

  const handleLabelChange = (id: string, newLabel: string) => {
    setEditedTabs(prev => prev.map(tab => tab.id === id ? { ...tab, label: newLabel } : tab));
  };

  const handleDelete = (id: string) => {
    setEditedTabs(prev => prev.filter(tab => tab.id !== id));
  };

  const handleToggleHidden = (id: string) => {
    setEditedTabs(prev => prev.map(tab => tab.id === id ? { ...tab, hidden: !tab.hidden } : tab));
  };

  const handleMoveUp = (index: number) => {
    if (index <= 1) return; // "Alle" bleibt immer oben
    setEditedTabs(prev => {
      const newTabs = [...prev];
      [newTabs[index - 1], newTabs[index]] = [newTabs[index], newTabs[index - 1]];
      return newTabs;
    });
  };

  const handleMoveDown = (index: number) => {
    if (index === 0 || index === editedTabs.length - 1) return;
    setEditedTabs(prev => {
      const newTabs = [...prev];
      [newTabs[index], newTabs[index + 1]] = [newTabs[index + 1], newTabs[index]];
      return newTabs;
    });
  };

  const handleAdd = () => {
    const name = newName.trim();
    if (!name) return;
    const id = `custom_${Date.now()}`;
    setEditedTabs(prev => [...prev, { id, label: name }]);
    setNewName('');
  };

  const handleSave = () => {
    onUpdateTabs(editedTabs.filter(t => t.label.trim()));
    onClose();
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={onClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 data-[state=open]:animate-fadeIn" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-gray-900 rounded-3xl border border-gray-800 shadow-2xl p-6 z-50 data-[state=open]:animate-contentShow">
          <div className="flex justify-between items-center mb-6">
            <Dialog.Title className="text-xl font-bold text-white">{t('tabModal.title')}</Dialog.Title>
            <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
              <X size={24} />
            </button>
          </div>

          <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
            {editedTabs.map((tab, index) => (
              <div key={tab.id} className={`flex items-center gap-2 p-3 rounded-xl border transition-colors ${tab.hidden ? 'bg-gray-800/30 border-gray-800 opacity-50' : 'bg-gray-800/50 border-gray-700/50'}`}>
                {/* Pfeile (nicht für "Alle") */}
                {tab.id !== 'all' ? (
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={() => handleMoveUp(index)}
                      disabled={index <= 1}
                      className="text-gray-400 hover:text-blue-400 disabled:opacity-20 transition-colors p-0.5"
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      onClick={() => handleMoveDown(index)}
                      disabled={index === editedTabs.length - 1}
                      className="text-gray-400 hover:text-blue-400 disabled:opacity-20 transition-colors p-0.5"
                    >
                      <ArrowDown size={14} />
                    </button>
                  </div>
                ) : <div className="w-[22px]" />}

                {/* Name */}
                <input
                  type="text"
                  value={tab.label}
                  onChange={(e) => handleLabelChange(tab.id, e.target.value)}
                  className="flex-1 bg-transparent text-white text-sm outline-none placeholder-gray-500 min-w-0"
                  placeholder={t('tabModal.placeholder')}
                  disabled={tab.id === 'all'}
                />

                {/* Sichtbarkeit Toggle (nicht für "Alle") */}
                {tab.id !== 'all' && (
                  <button
                    onClick={() => handleToggleHidden(tab.id)}
                    className={`p-1.5 rounded-lg transition-colors ${tab.hidden ? 'text-gray-500 hover:text-gray-300' : 'text-blue-400 hover:text-blue-300'}`}
                    title={tab.hidden ? t('tabModal.show') : t('tabModal.hide')}
                  >
                    {tab.hidden ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                )}

                {/* Löschen (nur custom Tabs) */}
                {tab.id !== 'all' && (
                  <button
                    onClick={() => handleDelete(tab.id)}
                    className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Neue Kategorie */}
          <div className="mt-4 flex items-center gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder={t('tabModal.newCategory')}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-500 outline-none focus:border-blue-500"
            />
            <button
              onClick={handleAdd}
              disabled={!newName.trim()}
              className="p-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl border border-gray-700 transition-colors disabled:opacity-30"
            >
              <Plus size={18} />
            </button>
          </div>

          {/* Speichern */}
          <div className="mt-6 flex justify-end">
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition-all active:scale-95"
            >
              <Save size={18} />
              <span>{t('common.save')}</span>
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
