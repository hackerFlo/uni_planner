import { createContext, useContext, useState, useEffect } from 'react';

const SetCountContext = createContext(() => {});
const AnyModalOpenContext = createContext(false);

export function ModalProvider({ children }) {
  const [count, setCount] = useState(0);
  return (
    <SetCountContext.Provider value={setCount}>
      <AnyModalOpenContext.Provider value={count > 0}>
        {children}
      </AnyModalOpenContext.Provider>
    </SetCountContext.Provider>
  );
}

export function useRegisterModal() {
  const setCount = useContext(SetCountContext);
  useEffect(() => {
    setCount(n => n + 1);
    return () => setCount(n => n - 1);
  }, [setCount]);
}

export function useAnyModalOpen() {
  return useContext(AnyModalOpenContext);
}
