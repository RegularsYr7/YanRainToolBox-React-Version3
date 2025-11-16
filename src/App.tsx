import { useState } from 'react';
import { DeviceProvider } from './Context/DeviceContext';
import { ThemeProvider } from './Context/ThemeContext';
import GlobalNavigation from './components/Navigation/GlobalNavigation';
import CustomTitleBar from './components/TitleBar/CustomTitleBar';
import HomePage from './View/HomePage';
import AppManagerPage from './View/AppManagerPage';
import BootPatchPage from './View/BootPatchPage';
import ToolsPage from './View/ToolsPage';
import BackupPage from './View/BackupPage';
import CommandPage from './View/CommandPage';
import PartitionExtractPage from './View/PartitionExtractPage';
import FastbootPartitionPage from './View/FastbootPartitionPage';

const pageComponents = {
  'home': HomePage,
  'app-manager': AppManagerPage,
  'boot-patch': BootPatchPage,
  'tools': ToolsPage,
  'backup': BackupPage,
  'shell': CommandPage,
  'partition-extract': PartitionExtractPage,
  'fastboot-partition': FastbootPartitionPage,
} as const;

type PageId = keyof typeof pageComponents;

function App() {
  const [currentPage, setCurrentPage] = useState<PageId>('home');

  const handlePageChange = (pageId: string) => {
    if (pageId in pageComponents) {
      setCurrentPage(pageId as PageId);
    } else {
      console.warn(`未知页面ID: ${pageId}`);
    }
  };

  const CurrentPageComponent = pageComponents[currentPage];

  return (
    <ThemeProvider>
      <DeviceProvider>
        <div className="h-screen bg-gray-50 dark:bg-dark-bg-primary flex flex-col overflow-hidden transition-colors duration-200">
          <CustomTitleBar />

          <div className="flex flex-1 overflow-hidden pt-10">
            <div className="flex-shrink-0" style={{ height: 'calc(100vh - 2.5rem)' }}>
              <GlobalNavigation
                currentPage={currentPage}
                onPageChange={handlePageChange}
              />
            </div>

            <main className="flex-1 overflow-auto bg-gray-50 dark:bg-slate-900 transition-colors duration-200">
              <div className="h-full">
                {currentPage === 'home' ? (
                  <HomePage onPageChange={handlePageChange} />
                ) : (
                  <CurrentPageComponent />
                )}
              </div>
            </main>
          </div>
        </div>
      </DeviceProvider>
    </ThemeProvider>
  );
}

export default App;