import { ArrowLeft, FileText, Folder, Search, Filter, MoreVertical, Plus } from "lucide-react";
import { useTranslation } from 'react-i18next';
import { motion } from "motion/react";

interface DocumentsScreenProps {
  onBack: () => void;
}

export default function DocumentsScreen({ onBack }: DocumentsScreenProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col h-screen w-full bg-gray-900 text-white font-sans overflow-hidden">
      {/* Header */}
      <header className="px-4 py-3 flex items-center justify-between bg-gray-900/95 backdrop-blur-md sticky top-0 z-20 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <button 
            onClick={onBack}
            className="p-2 -ml-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-all"
          >
            <ArrowLeft size={24} />
          </button>
          <h2 className="text-xl font-bold text-white">{t('documents.title')}</h2>
        </div>
        <div className="flex items-center gap-2">
            <button className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-colors">
                <Search size={22} />
            </button>
            <button className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-colors">
                <MoreVertical size={22} />
            </button>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        
        {/* Placeholder for future content */}
        <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
            <div className="w-20 h-20 bg-gray-800 rounded-full flex items-center justify-center text-teal-500 mb-2">
                <FileText size={40} />
            </div>
            <h3 className="text-xl font-semibold text-white">{t('documents.yourDocuments')}</h3>
            <p className="text-gray-400 max-w-xs text-sm leading-relaxed">
                {t('documents.emptyHint')}
            </p>
            <button className="mt-4 px-6 py-2.5 bg-teal-600 hover:bg-teal-500 text-white rounded-xl font-medium flex items-center gap-2 transition-colors">
                <Plus size={18} />
                <span>{t('documents.upload')}</span>
            </button>
        </div>

        {/* Roadmap Functional Block */}
        <div className="mt-8 pt-6 border-t border-gray-800 text-gray-500 text-xs">
            <h3 className="font-semibold text-gray-400 mb-4 uppercase tracking-wider">{t('documents.roadmap')}</h3>
            <div className="grid grid-cols-1 gap-6">
              
              {/* Phase 1 */}
              <div>
                <strong className="block text-gray-300 mb-1">{t('documents.phase1')}</strong>
                <ul className="list-disc pl-4 space-y-0.5 opacity-80">
                  <li>Upload</li>
                  <li>Download</li>
                  <li>Dokument anzeigen</li>
                  <li>Dokumentliste pro Chat oder Nutzer</li>
                </ul>
              </div>

              {/* Phase 2 */}
              <div>
                <strong className="block text-gray-300 mb-1">{t('documents.phase2')}</strong>
                <ul className="list-disc pl-4 space-y-0.5 opacity-80">
                  <li>Ordner</li>
                  <li>Tags</li>
                  <li>Suche</li>
                  <li>Sortierung</li>
                  <li>Umbenennen</li>
                  <li>Löschen</li>
                </ul>
              </div>

              {/* Phase 3 */}
              <div>
                <strong className="block text-gray-300 mb-1">{t('documents.phase3')}</strong>
                <ul className="list-disc pl-4 space-y-0.5 opacity-80">
                  <li>Dokumente an Nachrichten anhängen</li>
                  <li>Dokumente automatisch im Chat anzeigen</li>
                  <li>Dokumente in Spaces organisieren</li>
                  <li>Berechtigungen</li>
                </ul>
              </div>

              {/* Phase 4 */}
              <div>
                <strong className="block text-gray-300 mb-1">{t('documents.phase4')}</strong>
                <ul className="list-disc pl-4 space-y-0.5 opacity-80">
                  <li>Versionierung</li>
                  <li>Office-Vorschau</li>
                  <li>OCR</li>
                  <li>Signaturen</li>
                  <li>Freigabelinks</li>
                  <li>Offline-Modus</li>
                  <li>Verschlüsselung</li>
                </ul>
              </div>

            </div>
          </div>

      </div>
    </div>
  );
}