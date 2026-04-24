import { useState, useCallback } from 'react';
import { api } from '../api/client';

export function useTodos() {
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchTodos = useCallback(async () => {
    setLoading(true);
    try {
      const { todos } = await api.get('/api/todos');
      setTodos(todos);
    } finally {
      setLoading(false);
    }
  }, []);

  const createTodo = useCallback(async (data) => {
    const { todo } = await api.post('/api/todos', data);
    setTodos(prev => [todo, ...prev]);
    return todo;
  }, []);

  const updateTodo = useCallback(async (id, data) => {
    const { todo } = await api.patch(`/api/todos/${id}`, data);
    setTodos(prev => prev.map(t => t.id === id ? todo : t).filter(t => !t.archived));
    return todo;
  }, []);

  const deleteTodo = useCallback(async (id) => {
    await api.delete(`/api/todos/${id}`);
    setTodos(prev => prev.filter(t => t.id !== id));
  }, []);

  const assignDay = useCallback(async (id, day) => {
    const { todo } = await api.patch(`/api/todos/${id}`, { day_assigned: day });
    setTodos(prev => prev.map(t => t.id === id ? todo : t));
    return todo;
  }, []);

  return { todos, loading, fetchTodos, createTodo, updateTodo, deleteTodo, assignDay };
}
