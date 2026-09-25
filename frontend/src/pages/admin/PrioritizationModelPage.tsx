import { FormEvent, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { errorMessage, prioritizationApi } from '../../api/client';
import type { Question, ScoringCategory } from '../../types';

function CategoryEditor({ category }: { category: ScoringCategory }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(category);
  const save = useMutation({
    mutationFn: () => prioritizationApi.updateCategory(category.id, {
      name: draft.name, parent: draft.parent, weight: draft.weight, notes: draft.notes, isActive: draft.isActive,
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scoring-categories'] }),
  });
  return <div className="model-category-row">
    <input aria-label="Category name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
    <select aria-label="Parent dimension" value={draft.parent} onChange={(event) => setDraft({ ...draft, parent: event.target.value as ScoringCategory['parent'] })}><option>Impact</option><option>Complexity</option></select>
    <label className="weight-field"><span>Weight</span><input type="number" min="0" max="1" step="0.05" value={draft.weight} onChange={(event) => setDraft({ ...draft, weight: Number(event.target.value) })} /></label>
    <label className="toggle-label"><input type="checkbox" checked={draft.isActive !== false} onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })} /> Active</label>
    <button type="button" onClick={() => save.mutate()} disabled={save.isPending}>Save</button>
  </div>;
}

function QuestionEditor({ question, categories }: { question: Question; categories: ScoringCategory[] }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(question);
  const save = useMutation({
    mutationFn: () => prioritizationApi.updateQuestion(question.id, {
      text: draft.text, categoryId: draft.categoryId, weight: draft.weight, sequence: draft.sequence,
      isActive: draft.isActive, required: draft.required, metric: draft.metric, subtitle: draft.subtitle, helpText: draft.helpText,
      options: Object.fromEntries(draft.options.map((option) => [option.score, option.text])),
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-questions'] }),
  });
  const setOption = (score: number, text: string) => setDraft({ ...draft, options: draft.options.map((option) => option.score === score ? { ...option, text } : option) });
  return <details className="model-question" open={false}>
    <summary><span>{draft.text}</span><span className="badge">{draft.categoryName ?? 'Uncategorized'} · {draft.weight}</span></summary>
    <div className="model-question-form">
      <label className="span-2">Question<input value={draft.text} onChange={(event) => setDraft({ ...draft, text: event.target.value })} /></label>
      <label>Category<select value={draft.categoryId} onChange={(event) => setDraft({ ...draft, categoryId: event.target.value })}>{categories.map((category) => <option key={category.id} value={category.id}>{category.parent} / {category.name}</option>)}</select></label>
      <label>Question weight<input type="number" min="0" step="0.1" value={draft.weight} onChange={(event) => setDraft({ ...draft, weight: Number(event.target.value) })} /></label>
      <label>Order<input type="number" min="0" value={draft.sequence ?? 0} onChange={(event) => setDraft({ ...draft, sequence: Number(event.target.value) })} /></label>
      <label>Metric<input value={draft.metric ?? ''} onChange={(event) => setDraft({ ...draft, metric: event.target.value })} /></label>
      <label className="span-2">Subtitle<input value={draft.subtitle ?? ''} onChange={(event) => setDraft({ ...draft, subtitle: event.target.value })} /></label>
      <label className="toggle-label"><input type="checkbox" checked={draft.required !== false} onChange={(event) => setDraft({ ...draft, required: event.target.checked })} /> Required</label>
      <label className="toggle-label"><input type="checkbox" checked={draft.isActive !== false} onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })} /> Active</label>
      <div className="model-options span-2">{draft.options.map((option) => <label key={option.score}><span>{option.label} ({option.score})</span><textarea rows={2} value={option.text} onChange={(event) => setOption(option.score, event.target.value)} /></label>)}</div>
      <div className="span-2 form-actions"><button className="primary" type="button" onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save question'}</button>{save.isError && <span className="field-error">{errorMessage(save.error)}</span>}</div>
    </div>
  </details>;
}

export default function PrioritizationModelPage() {
  const queryClient = useQueryClient();
  const model = useQuery({ queryKey: ['prioritization-model'], queryFn: prioritizationApi.model });
  const [parentWeights, setParentWeights] = useState({ impactWeight: 0.5, complexityWeight: 0.5 });
  const saveModel = useMutation({
    mutationFn: () => prioritizationApi.updateModel(parentWeights),
    onSuccess: (updated) => {
      setParentWeights({ impactWeight: updated.parentWeights.Impact, complexityWeight: updated.parentWeights.Complexity });
      queryClient.setQueryData(['prioritization-model'], updated);
    },
  });
  const categories = useQuery({ queryKey: ['scoring-categories'], queryFn: prioritizationApi.categories });
  const questions = useQuery({ queryKey: ['admin-questions'], queryFn: () => prioritizationApi.questions(true) });
  const [newCategory, setNewCategory] = useState<{ name: string; parent: 'Impact' | 'Complexity'; weight: number }>({ name: '', parent: 'Impact', weight: 0.1 });
  const [newQuestion, setNewQuestion] = useState({ text: '', categoryId: '', weight: 1 });
  useEffect(() => {
    if (model.data) setParentWeights({ impactWeight: model.data.parentWeights.Impact, complexityWeight: model.data.parentWeights.Complexity });
  }, [model.data]);
  const createCategory = useMutation({ mutationFn: () => prioritizationApi.createCategory(newCategory), onSuccess: () => { setNewCategory({ name: '', parent: 'Impact', weight: 0.1 }); queryClient.invalidateQueries({ queryKey: ['scoring-categories'] }); } });
  const createQuestion = useMutation({ mutationFn: () => prioritizationApi.createQuestion({
    ...newQuestion, sequence: (questions.data?.length ?? 0) + 1, required: true,
    options: { 0: 'No impact', 1: 'Low impact', 5: 'Moderate impact', 10: 'High impact', 15: 'Critical impact' },
  }), onSuccess: () => { setNewQuestion({ text: '', categoryId: '', weight: 1 }); queryClient.invalidateQueries({ queryKey: ['admin-questions'] }); } });

  const addCategory = (event: FormEvent) => { event.preventDefault(); if (newCategory.name.trim()) createCategory.mutate(); };
  const addQuestion = (event: FormEvent) => { event.preventDefault(); if (newQuestion.text.trim() && newQuestion.categoryId) createQuestion.mutate(); };
  return <main className="model-page">
    <header><p className="eyebrow">Scoring governance</p><h1 className="page-title">Prioritization model</h1><p className="page-subtitle">Maintain dimensions, category weights, questions, and sponsor response choices.</p></header>
    <section className="model-section"><div className="section-title"><h2>Parent dimension weights</h2><p>Controls the final score split between Impact and Complexity. Values are normalized when combined.</p></div>
      <div className="model-parent-weights">
        <label>Impact<input type="number" min="0" max="1" step="0.05" value={parentWeights.impactWeight} onChange={(event) => setParentWeights({ ...parentWeights, impactWeight: Number(event.target.value) })} /></label>
        <label>Complexity<input type="number" min="0" max="1" step="0.05" value={parentWeights.complexityWeight} onChange={(event) => setParentWeights({ ...parentWeights, complexityWeight: Number(event.target.value) })} /></label>
        <button className="primary" type="button" onClick={() => saveModel.mutate()} disabled={saveModel.isPending || parentWeights.impactWeight + parentWeights.complexityWeight <= 0}>{saveModel.isPending ? 'Saving…' : 'Save parent weights'}</button>
        {saveModel.isError && <span className="field-error">{errorMessage(saveModel.error)}</span>}
      </div>
    </section>
    <section className="model-section"><div className="section-title"><h2>Categories</h2><p>Weights are normalized within Impact and Complexity.</p></div>
      <div className="model-category-list">{categories.data?.map((category) => <CategoryEditor category={category} key={category.id} />)}</div>
      <form className="model-add-row" onSubmit={addCategory}><input placeholder="New category" value={newCategory.name} onChange={(event) => setNewCategory({ ...newCategory, name: event.target.value })} /><select value={newCategory.parent} onChange={(event) => setNewCategory({ ...newCategory, parent: event.target.value as 'Impact' | 'Complexity' })}><option>Impact</option><option>Complexity</option></select><input aria-label="Weight" type="number" min="0" max="1" step="0.05" value={newCategory.weight} onChange={(event) => setNewCategory({ ...newCategory, weight: Number(event.target.value) })} /><button type="submit">Add category</button></form>
    </section>
    <section className="model-section"><div className="section-title"><h2>Questions and answers</h2><p>Expand a question to edit its five curated responses.</p></div>
      <form className="model-add-row question-add" onSubmit={addQuestion}><input placeholder="New question" value={newQuestion.text} onChange={(event) => setNewQuestion({ ...newQuestion, text: event.target.value })} /><select value={newQuestion.categoryId} onChange={(event) => setNewQuestion({ ...newQuestion, categoryId: event.target.value })}><option value="">Select category</option>{categories.data?.map((category) => <option key={category.id} value={category.id}>{category.parent} / {category.name}</option>)}</select><button type="submit">Add question</button></form>
      <div className="model-question-list">{questions.data?.map((question) => <QuestionEditor key={question.id} question={question} categories={categories.data ?? []} />)}</div>
    </section>
  </main>;
}