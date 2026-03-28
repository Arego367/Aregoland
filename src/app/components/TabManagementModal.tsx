import * as Dialog from "@radix-ui/react-dialog";
import { X, Trash2, Save, Edit2, ArrowUp, ArrowDown, Plus } from "lucide-react";
import { useState, useEffect } from "react";
import { Tab } from "../types";

interface TabManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  tabs: Tab[];
  onUpdateTabs: (tabs: Tab[]) => void;
}

export function TabManagementModal({ isOpen, onClose, tabs, onUpdateTabs }: TabManagementModalProps) {
  const [editedTabs, setEditedTabs] = useState<Tab[]>(tabs);

  useEffect(() => {
    setEditedTabs(tabs);
  }, [tabs]);

  const handleLabelChange = (id: string, newLabel: string) => {
    setEditedTabs(prev => prev.map(tab => tab.id === id ? { ...tab, label: newLabel } : tab));
  };

  const handleDelete = (id: string) => {
    setEditedTabs(prev => prev.filter(tab => tab.id !== id));
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    setEditedTabs(prev => {
      const newTabs = [...prev];
      [newTabs[index - 1], newTabs[index]] = [newTabs[index], newTabs[index - 1]];
      return newTabs;
    });
  };

  const handleMoveDown = (index: number) => {
    if (index === editedTabs.length - 1) return;
    setEditedTabs(prev => {
      const newTabs = [...prev];
      [newTabs[index], newTabs[index + 1]] = [newTabs[index + 1], newTabs[index]];
      return newTabs;
    });
  };

  const handleAddTab = () => {
    const newId = `custom-${Date.now()}`;
    setEditedTabs(prev => [...prev, { id: newId, label: "" }]);
  };

  const handleSave = () => {
    onUpdateTabs(editedTabs);
    onClose();
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={onClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 data-[state=open]:animate-fadeIn" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-gray-900 rounded-3xl border border-gray-800 shadow-2xl p-6 z-50 data-[state=open]:animate-contentShow">
          <div className="flex justify-between items-center mb-6">
            <Dialog.Title className="text-xl font-bold text-white">Reiter bearbeiten</Dialog.Title>
            <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
              <X size={24} />
            </button>
          </div>

          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
            {editedTabs.map((tab, index) => (
              <div key={tab.id} className="flex items-center gap-3 bg-gray-800/50 p-3 rounded-xl border border-gray-700/50">
                 <div className="flex flex-col gap-1">
                   <button 
                     onClick={() => handleMoveUp(index)}
                     disabled={index === 0}
                     className="text-gray-400 hover:text-blue-400 disabled:opacity-30 disabled:hover:text-gray-400 transition-colors"
                     title="Nach oben"
                   >
                     <ArrowUp size={16} />
                   </button>
                   <button 
                     onClick={() => handleMoveDown(index)}
                     disabled={index === editedTabs.length - 1}
                     className="text-gray-400 hover:text-blue-400 disabled:opacity-30 disabled:hover:text-gray-400 transition-colors"
                     title="Nach unten"
                   >
                     <ArrowDown size={16} />
                   </button>
                 </div>
                <div className="flex-1">
                  <input
                    type="text"
                    value={tab.label}
                    onChange={(e) => handleLabelChange(tab.id, e.target.value)}
                    className="bg-transparent w-full text-white outline-none placeholder-gray-500 focus:border-b focus:border-blue-500 transition-colors"
                    placeholder="Name"
                    disabled={tab.id === 'all'} 
                    autoFocus={tab.label === "" && tab.id.startsWith("custom-")}
                  />
                </div>
                {tab.id !== 'all' && (
                  <button 
                    onClick={() => handleDelete(tab.id)}
                    className="text-red-400 hover:text-red-300 p-2 hover:bg-red-500/10 rounded-lg transition-colors"
                    title="Löschen"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={handleAddTab}
              className="flex items-center gap-2 px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-medium transition-all active:scale-95 border border-gray-700"
            >
              <Plus size={18} />
              <span>Hinzufügen</span>
            </button>
            <button 
              onClick={handleSave}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition-all active:scale-95"
            >
              <Save size={18} />
              <span>Speichern</span>
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
