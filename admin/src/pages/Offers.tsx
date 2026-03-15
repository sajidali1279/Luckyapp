import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { offersApi, storesApi } from '../services/api';
import { useAuthStore } from '../store/authStore';

// ─── Suggestion Templates ─────────────────────────────────────────────────────

type Template = {
  icon: string;
  group: string;
  title: string;
  description: string;
  bonusRate: string;
  category: string;
};

const TEMPLATES: Template[] = [
  // ⛽ Gas & Diesel
  { icon: '⛽', group: 'Gas & Diesel', title: 'Double Gas Points Weekend', description: 'Earn 2x cashback on all gas purchases this weekend. Fill up and save more at Lucky Stop!', bonusRate: '3', category: 'GAS' },
  { icon: '⛽', group: 'Gas & Diesel', title: 'Full Tank Friday', description: 'Fill up on Friday and earn double credits on every gallon. More gas, more rewards.', bonusRate: '3', category: 'GAS' },
  { icon: '⛽', group: 'Gas & Diesel', title: 'Gas Saver Monday', description: 'Kick off the week with 3x points on all gas purchases every Monday.', bonusRate: '6', category: 'GAS' },
  { icon: '🚛', group: 'Gas & Diesel', title: 'Diesel Driver Deal', description: 'Truckers and fleet drivers earn bonus cashback on every diesel fill. Valid all week.', bonusRate: '3', category: 'DIESEL' },
  { icon: '🚛', group: 'Gas & Diesel', title: 'Diesel Double Up Week', description: 'Earn 6% cashback on all diesel fills this week. A special thank-you to our big rig regulars.', bonusRate: '3', category: 'DIESEL' },
  // 🌮 Hot Foods
  { icon: '🌮', group: 'Hot Foods', title: 'Hot Food Happy Hour', description: 'Double points on all hot food purchases between 11am and 2pm, every day this week.', bonusRate: '7', category: 'HOT_FOODS' },
  { icon: '☕', group: 'Hot Foods', title: 'Morning Commuter Special', description: 'Earn 10% cashback on hot coffee and breakfast items before noon. Start your day rewarded.', bonusRate: '3', category: 'HOT_FOODS' },
  { icon: '🌮', group: 'Hot Foods', title: 'Taco Tuesday', description: 'Double cashback on all hot foods every Tuesday. Make Tuesday your Lucky Stop day!', bonusRate: '7', category: 'HOT_FOODS' },
  { icon: '🌮', group: 'Hot Foods', title: 'Lunch Rush Deal', description: 'Grab lunch from 11am–1pm and earn bonus credits on all hot food items.', bonusRate: '7', category: 'HOT_FOODS' },
  { icon: '❄️', group: 'Hot Foods', title: 'Cold Weather Comfort', description: 'Warm up and earn more. Double points on all hot foods and hot beverages this week.', bonusRate: '7', category: 'HOT_FOODS' },
  // 🛒 Groceries
  { icon: '🛒', group: 'Groceries', title: 'Weekend Grocery Bonus', description: 'Double credits on all grocery purchases Saturday and Sunday. Stock up and save.', bonusRate: '5', category: 'GROCERIES' },
  { icon: '🛒', group: 'Groceries', title: 'Stock Up & Save', description: 'Earn 8% cashback on grocery orders this week. Every item counts toward your balance.', bonusRate: '3', category: 'GROCERIES' },
  { icon: '🥗', group: 'Groceries', title: 'Fresh Food Friday', description: 'Double cashback on all fresh produce and fresh foods every Friday.', bonusRate: '5', category: 'FRESH_FOODS' },
  { icon: '🧊', group: 'Groceries', title: 'Frozen Food Frenzy', description: 'Earn 10% on all frozen food items this week. Great deals on freezer favorites.', bonusRate: '5', category: 'FROZEN_FOODS' },
  { icon: '🥗', group: 'Groceries', title: 'Healthy Choice Week', description: 'Earn bonus credits on all fresh and frozen foods. Eating well pays off at Lucky Stop.', bonusRate: '5', category: 'FRESH_FOODS' },
  // 🚬 Tobacco & Vapes
  { icon: '🚬', group: 'Tobacco & Vapes', title: 'Loyalty Vape Deal', description: 'Earn 6% cashback on all vape products this week. Exclusive for our loyal customers.', bonusRate: '2', category: 'TOBACCO_VAPES' },
  { icon: '🚬', group: 'Tobacco & Vapes', title: 'Tobacco Thursday', description: 'Double points on all tobacco and vape products every Thursday. Make it your lucky day.', bonusRate: '4', category: 'TOBACCO_VAPES' },
  // 🎉 Seasonal
  { icon: '☀️', group: 'Seasonal', title: 'Summer Road Trip Bonus', description: 'All summer long — earn double points on gas. Hit the road and rack up rewards at Lucky Stop.', bonusRate: '3', category: 'GAS' },
  { icon: '🎄', group: 'Seasonal', title: 'Holiday Bonus Weekend', description: 'Earn 2x on all purchases during the holiday weekend. Happy holidays from Lucky Stop!', bonusRate: '5', category: '' },
  { icon: '🎓', group: 'Seasonal', title: 'Back to School Special', description: 'Extra credits on snacks, drinks, and groceries all August. Fuel up for the school year!', bonusRate: '5', category: 'GROCERIES' },
  { icon: '🎆', group: 'Seasonal', title: 'Fourth of July Flash Sale', description: '3x points on all purchases on July 4th only. Celebrate and save at Lucky Stop!', bonusRate: '10', category: '' },
  { icon: '🏈', group: 'Seasonal', title: 'Game Day Double Points', description: 'Double points on all snacks and beverages on game day. Score big rewards at Lucky Stop.', bonusRate: '5', category: 'HOT_FOODS' },
  { icon: '🎊', group: 'Seasonal', title: 'New Year Triple Points', description: 'Start the new year right — triple points on all purchases for the first 3 days of January.', bonusRate: '10', category: '' },
  // 💎 Loyalty
  { icon: '💎', group: 'Loyalty', title: 'Thank You Month', description: 'Every purchase earns 2x cashback this month. Our way of saying thank you to our loyal customers.', bonusRate: '5', category: '' },
  { icon: '⚡', group: 'Loyalty', title: 'Flash 24-Hour Sale', description: "Triple points for exactly 24 hours — today only! Don't miss this limited-time Lucky Stop deal.", bonusRate: '10', category: '' },
  { icon: '💰', group: 'Loyalty', title: 'Big Spender Bonus', description: 'Earn 3x points on any single purchase over $50 this week. Bigger purchase, bigger rewards.', bonusRate: '10', category: '' },
  { icon: '🌟', group: 'Loyalty', title: 'Weekend Double Points', description: 'Every Saturday and Sunday, earn double cashback on all purchases store-wide.', bonusRate: '5', category: '' },
  { icon: '🎁', group: 'Loyalty', title: 'Surprise Bonus Week', description: 'Surprise! All customers earn extra cashback on every purchase this week. No limits, no exclusions.', bonusRate: '5', category: '' },
  // 🥤 Products
  { icon: '🥤', group: 'Products', title: 'Coca-Cola Double Points Day', description: 'Buy any Coca-Cola product today and earn double cashback. Classic taste, better rewards at Lucky Stop!', bonusRate: '5', category: 'GROCERIES' },
  { icon: '🥤', group: 'Products', title: 'Coke Variety Pack Bonus', description: 'Pick up a Coke, Diet Coke, Coke Zero, or Sprite and earn 2x points. Mix and match — all Coca-Cola products included.', bonusRate: '5', category: 'GROCERIES' },
  { icon: '🔵', group: 'Products', title: 'Pepsi Points Fiesta', description: 'Earn double cashback on all Pepsi products this week. Pepsi, Diet Pepsi, Mountain Dew — all count!', bonusRate: '5', category: 'GROCERIES' },
  { icon: '🔵', group: 'Products', title: 'Pepsi Weekend Rush', description: 'Grab a cold Pepsi this weekend and earn 3x points. The refreshing choice that keeps on rewarding.', bonusRate: '7', category: 'GROCERIES' },
  { icon: '🟢', group: 'Products', title: 'Monster Energy Madness', description: 'Fuel your day with Monster Energy and earn triple cashback on every can. All Monster flavors included!', bonusRate: '10', category: 'GROCERIES' },
  { icon: '🟢', group: 'Products', title: 'Monster Monday Boost', description: 'Start your week with a Monster Energy and earn 3x points every Monday. Stay charged, stay rewarded.', bonusRate: '10', category: 'GROCERIES' },
  { icon: '🐂', group: 'Products', title: 'Red Bull Give You Wings Deal', description: 'Red Bull earns you double cashback all week long. Pick up your favorite flavor and soar with rewards.', bonusRate: '7', category: 'GROCERIES' },
  { icon: '🐂', group: 'Products', title: 'Red Bull 4-Pack Bonus', description: 'Buy a Red Bull 4-pack and earn 3x points. The more cans, the more credits back in your Lucky Stop wallet.', bonusRate: '10', category: 'GROCERIES' },
  { icon: '🟡', group: 'Products', title: "Frito-Lay Snack Attack", description: "Double points on all Frito-Lay snacks this week — Lay's, Doritos, Cheetos, Fritos, and more. Snack big, earn big!", bonusRate: '7', category: 'GROCERIES' },
  { icon: '🟡', group: 'Products', title: 'Game Day Frito-Lay Bundle', description: "Stock up on Doritos, Lay's, and Tostitos for game day and earn 2x cashback. Snack smarter at Lucky Stop.", bonusRate: '5', category: 'GROCERIES' },
  { icon: '☕', group: 'Products', title: 'Coffee Lover Bonus', description: 'Earn 3x points on all hot coffee purchases this week. Whether it\'s your morning cup or afternoon pick-me-up — you\'re covered.', bonusRate: '10', category: 'HOT_FOODS' },
  { icon: '☕', group: 'Products', title: 'Morning Coffee Double Points', description: 'First coffee of the day earns double cashback before 10am every day this week. Wake up and earn at Lucky Stop.', bonusRate: '7', category: 'HOT_FOODS' },
  { icon: '💧', group: 'Products', title: 'Hydration Rewards Week', description: 'Earn double cashback on all bottled water purchases. Dasani, Aquafina, Smartwater — stay hydrated and rewarded.', bonusRate: '5', category: 'GROCERIES' },
  { icon: '💧', group: 'Products', title: 'Water Case Bonus', description: 'Buy a case of water and earn 3x points instantly. Stock up at Lucky Stop and save big on your balance.', bonusRate: '10', category: 'GROCERIES' },
];

const TEMPLATE_GROUPS = [...new Set(TEMPLATES.map((t) => t.group))];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { value: '', label: 'All Categories' },
  { value: 'GROCERIES', label: 'Groceries' },
  { value: 'FROZEN_FOODS', label: 'Frozen Foods' },
  { value: 'FRESH_FOODS', label: 'Fresh Foods' },
  { value: 'GAS', label: 'Gas' },
  { value: 'DIESEL', label: 'Diesel' },
  { value: 'TOBACCO_VAPES', label: 'Tobacco & Vapes' },
  { value: 'HOT_FOODS', label: 'Hot Foods' },
  { value: 'OTHER', label: 'Other' },
];

function todayStr() { return new Date().toISOString().slice(0, 10); }
function endOfMonthStr() { const d = new Date(); d.setMonth(d.getMonth() + 1); return d.toISOString().slice(0, 10); }
function fmtDate(d: string) { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Offers() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const isStoreManager = user?.role === 'STORE_MANAGER';
  const [mainTab, setMainTab] = useState<'promotions' | 'deals'>('promotions');
  const [showForm, setShowForm] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [activeGroup, setActiveGroup] = useState(TEMPLATE_GROUPS[0]);
  // Deal form state
  const [showDealForm, setShowDealForm] = useState(false);
  const [dealTitle, setDealTitle] = useState('');
  const [dealText, setDealText] = useState('');
  const [dealDescription, setDealDescription] = useState('');
  const [dealCategory, setDealCategory] = useState('');
  const [dealType, setDealType] = useState<'ALL_STORES' | 'SPECIFIC_STORE'>('ALL_STORES');
  const [dealStoreId, setDealStoreId] = useState('');
  const [dealStartDate, setDealStartDate] = useState(todayStr());
  const [dealEndDate, setDealEndDate] = useState(endOfMonthStr());
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [bonusRate, setBonusRate] = useState('');
  const [type, setType] = useState<'ALL_STORES' | 'SPECIFIC_STORE'>('ALL_STORES');
  const [storeId, setStoreId] = useState('');
  const [category, setCategory] = useState('');
  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate] = useState(endOfMonthStr());
  const [imageFile, setImageFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery({ queryKey: ['offers'], queryFn: () => offersApi.getActive() });
  const { data: historyData } = useQuery({
    queryKey: ['offers-history'], queryFn: () => offersApi.getHistory(), enabled: showHistory,
  });
  const { data: storesData } = useQuery({ queryKey: ['stores'], queryFn: () => storesApi.getAll() });

  const offers: any[] = data?.data?.data || [];
  const pastOffers: any[] = historyData?.data?.data || [];
  const stores: any[] = storesData?.data?.data || [];

  const createMutation = useMutation({
    mutationFn: (fd: FormData) => offersApi.create(fd),
    onSuccess: () => {
      toast.success('Offer created');
      resetForm();
      qc.invalidateQueries({ queryKey: ['offers'] });
      qc.invalidateQueries({ queryKey: ['offers-history'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Failed to create offer'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => offersApi.delete(id),
    onSuccess: () => { toast.success('Offer deleted'); qc.invalidateQueries({ queryKey: ['offers'] }); },
    onError: () => toast.error('Failed to delete offer'),
  });

  function resetForm() {
    setShowForm(false);
    setTitle(''); setDescription(''); setBonusRate('');
    setType('ALL_STORES'); setStoreId(''); setCategory('');
    setStartDate(todayStr()); setEndDate(endOfMonthStr()); setImageFile(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  function applyTemplate(t: Template) {
    setTitle(t.title);
    setDescription(t.description);
    setBonusRate(t.bonusRate);
    setCategory(t.category);
    setShowForm(true);
    setShowTemplates(false);
    setTimeout(() => document.getElementById('offer-form')?.scrollIntoView({ behavior: 'smooth' }), 100);
  }

  function reuseOffer(offer: any) {
    setTitle(offer.title);
    setDescription(offer.description || '');
    setBonusRate(offer.bonusRate ? String(Math.round(offer.bonusRate * 100)) : '');
    setCategory(offer.category || '');
    setType(offer.type || 'ALL_STORES');
    setStoreId(offer.storeId || '');
    setStartDate(todayStr());
    setEndDate(endOfMonthStr());
    setShowForm(true);
    setTimeout(() => document.getElementById('offer-form')?.scrollIntoView({ behavior: 'smooth' }), 100);
    toast.success('Form filled from past offer — update the dates and submit');
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { toast.error('Title is required'); return; }
    if (!description.trim()) { toast.error('Description is required'); return; }
    if (!startDate || !endDate) { toast.error('Start and end dates are required'); return; }
    if (type === 'SPECIFIC_STORE' && !storeId) { toast.error('Select a store'); return; }
    const fd = new FormData();
    fd.append('title', title.trim());
    fd.append('description', description.trim());
    fd.append('type', type);
    fd.append('startDate', new Date(startDate).toISOString());
    fd.append('endDate', new Date(endDate + 'T23:59:59').toISOString());
    if (bonusRate) fd.append('bonusRate', (parseFloat(bonusRate) / 100).toString());
    if (type === 'SPECIFIC_STORE' && storeId) fd.append('storeId', storeId);
    if (category) fd.append('category', category);
    if (imageFile) fd.append('image', imageFile);
    createMutation.mutate(fd);
  }

  const groupedTemplates = TEMPLATES.filter((t) => t.group === activeGroup);
  const promotionOffers = offers.filter((o: any) => !o.dealText);
  const dealOffers = offers.filter((o: any) => o.dealText);
  const pastPromotions = pastOffers.filter((o: any) => !o.dealText);
  const pastDeals = pastOffers.filter((o: any) => o.dealText);

  function resetDealForm() {
    setShowDealForm(false);
    setDealTitle(''); setDealText(''); setDealDescription('');
    setDealCategory(''); setDealType('ALL_STORES'); setDealStoreId('');
    setDealStartDate(todayStr()); setDealEndDate(endOfMonthStr());
  }

  function handleCreateDeal(e: React.FormEvent) {
    e.preventDefault();
    if (!dealTitle.trim()) { toast.error('Title is required'); return; }
    if (!dealText.trim()) { toast.error('Deal text is required (e.g. "2 for $5")'); return; }
    if (!dealStartDate || !dealEndDate) { toast.error('Start and end dates are required'); return; }
    if (dealType === 'SPECIFIC_STORE' && !dealStoreId) { toast.error('Select a store'); return; }
    const fd = new FormData();
    fd.append('title', dealTitle.trim());
    fd.append('description', dealDescription.trim() || dealText.trim());
    fd.append('dealText', dealText.trim());
    fd.append('type', dealType);
    fd.append('startDate', new Date(dealStartDate).toISOString());
    fd.append('endDate', new Date(dealEndDate + 'T23:59:59').toISOString());
    if (dealType === 'SPECIFIC_STORE' && dealStoreId) fd.append('storeId', dealStoreId);
    if (dealCategory) fd.append('category', dealCategory);
    createMutation.mutate(fd);
    resetDealForm();
  }

  return (
    <div style={s.container}>
      {/* Header */}
      <div style={s.header}>
        <div>
          <h1 style={s.title}>📢 Offers & Promotions</h1>
          <p style={s.sub}>Promotions boost cashback automatically — Deals display price specials in the app</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {mainTab === 'promotions' && (
            <>
              <button style={s.templateBtn} onClick={() => { setShowTemplates(!showTemplates); setShowForm(false); }}>
                💡 {showTemplates ? 'Hide' : 'Suggestions'} ({TEMPLATES.length})
              </button>
              <button style={s.addBtn} onClick={() => { setShowForm(!showForm); setShowTemplates(false); }}>
                {showForm ? 'Cancel' : '+ New Promotion'}
              </button>
            </>
          )}
          {mainTab === 'deals' && (
            <button style={s.addBtn} onClick={() => setShowDealForm(!showDealForm)}>
              {showDealForm ? 'Cancel' : '+ New Deal'}
            </button>
          )}
        </div>
      </div>

      {/* Main Tabs */}
      <div style={s.mainTabs}>
        <button style={{ ...s.mainTab, ...(mainTab === 'promotions' ? s.mainTabActive : {}) }}
          onClick={() => { setMainTab('promotions'); setShowDealForm(false); }}>
          📢 Promotions
          <span style={s.tabCount}>{promotionOffers.length}</span>
        </button>
        <button style={{ ...s.mainTab, ...(mainTab === 'deals' ? s.mainTabActive : {}) }}
          onClick={() => { setMainTab('deals'); setShowForm(false); setShowTemplates(false); }}>
          🏷️ Deals
          <span style={s.tabCount}>{dealOffers.length}</span>
        </button>
      </div>

      {/* Suggestion Templates */}
      {showTemplates && (
        <div style={s.suggestionsBox}>
          <h3 style={s.suggestTitle}>💡 Promotion Templates</h3>
          <p style={s.suggestSub}>Click any template to instantly pre-fill the form — you just set the dates and submit.</p>
          <div style={s.groupTabs}>
            {TEMPLATE_GROUPS.map((g) => (
              <button key={g} style={{ ...s.groupTab, ...(activeGroup === g ? s.groupTabActive : {}) }} onClick={() => setActiveGroup(g)}>
                {g} ({TEMPLATES.filter((t) => t.group === g).length})
              </button>
            ))}
          </div>
          <div style={s.templateGrid}>
            {groupedTemplates.map((t, i) => (
              <div key={i} style={s.templateCard}>
                <div style={s.templateIcon}>{t.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={s.templateTitle}>{t.title}</div>
                  <div style={s.templateDesc}>{t.description}</div>
                  <div style={s.templateMeta}>
                    {t.bonusRate && <span style={s.templateBadge}>+{t.bonusRate}% bonus</span>}
                    {t.category && <span style={s.templateCat}>{t.category.replace(/_/g, ' ')}</span>}
                  </div>
                </div>
                <button style={s.useBtn} onClick={() => applyTemplate(t)}>Use →</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create / Edit Form */}
      {showForm && (
        <form id="offer-form" style={s.form} onSubmit={handleCreate}>
          <h3 style={{ margin: '0 0 16px', color: '#1D3557' }}>
            {title ? `✏️ ${title}` : 'New Promotion'}
          </h3>
          <label style={s.label}>Title *</label>
          <input style={s.input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Double Gas Points Weekend" />
          <label style={s.label}>Description *</label>
          <textarea style={{ ...s.input, height: 80, resize: 'vertical' }} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the promotion details..." />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={s.label}>Start Date *</label>
              <input style={s.input} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <label style={s.label}>End Date *</label>
              <input style={s.input} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <label style={s.label}>Bonus Cashback % (optional — adds on top of standard rate)</label>
          <input style={s.input} type="number" min="0" max="100" value={bonusRate} onChange={(e) => setBonusRate(e.target.value)} placeholder="e.g. 5 = customers earn 10% total" />
          {isStoreManager ? (
            <div style={{ padding: '8px 12px', background: '#f0f4ff', borderRadius: 8, fontSize: 13, color: '#1D3557', fontWeight: 600 }}>
              📍 This promotion will apply to your store only
            </div>
          ) : (
            <>
              <label style={s.label}>Apply To</label>
              <select style={s.input} value={type} onChange={(e) => { setType(e.target.value as any); setStoreId(''); }}>
                <option value="ALL_STORES">🌐 All 14 Stores</option>
                <option value="SPECIFIC_STORE">📍 Specific Store Only</option>
              </select>
              {type === 'SPECIFIC_STORE' && (
                <>
                  <label style={s.label}>Select Store *</label>
                  <select style={s.input} value={storeId} onChange={(e) => setStoreId(e.target.value)}>
                    <option value="">-- Choose a store --</option>
                    {stores.map((store: any) => (
                      <option key={store.id} value={store.id}>{store.name} — {store.city}, {store.state}</option>
                    ))}
                  </select>
                </>
              )}
            </>
          )}
          <label style={s.label}>Product Category (optional)</label>
          <select style={s.input} value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <label style={s.label}>Promo Image (optional)</label>
          <input ref={fileRef} type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files?.[0] || null)} style={s.input} />
          <div style={{ display: 'flex', gap: 10 }}>
            <button style={s.saveBtn} type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating...' : 'Create Offer'}
            </button>
            <button style={s.cancelFormBtn} type="button" onClick={resetForm}>Cancel</button>
          </div>
        </form>
      )}

      {/* ── Promotions Tab ── */}
      {mainTab === 'promotions' && (
        <>
          {isLoading ? (
            <div style={s.empty}>Loading...</div>
          ) : promotionOffers.length === 0 ? (
            <div style={s.empty}>No active promotions. Use a template or create one manually.</div>
          ) : (
            <>
              <h2 style={s.sectionHead}>Active Promotions ({promotionOffers.length})</h2>
              <div style={s.grid}>
                {promotionOffers.map((offer: any) => (
                  <OfferCard key={offer.id} offer={offer} onDelete={() => deleteMutation.mutate(offer.id)} onReuse={() => reuseOffer(offer)} />
                ))}
              </div>
            </>
          )}
          <div style={{ marginTop: 40 }}>
            <button style={s.historyToggle} onClick={() => setShowHistory(!showHistory)}>
              {showHistory ? '▾' : '▸'} Past Promotions (click to load &amp; reuse)
            </button>
            {showHistory && (
              pastPromotions.length === 0 ? (
                <div style={s.empty}>No past promotions found.</div>
              ) : (
                <>
                  <p style={{ color: '#6c757d', fontSize: 13, margin: '0 0 16px' }}>
                    {pastPromotions.length} past promotions — click ♻️ Reuse on any to pre-fill the form.
                  </p>
                  <div style={s.grid}>
                    {pastPromotions.map((offer: any) => (
                      <OfferCard key={offer.id} offer={offer} isPast onReuse={() => reuseOffer(offer)} />
                    ))}
                  </div>
                </>
              )
            )}
          </div>
        </>
      )}

      {/* ── Deals Tab ── */}
      {mainTab === 'deals' && (
        <>
          {/* Deal create form */}
          {showDealForm && (
            <form id="deal-form" style={s.form} onSubmit={handleCreateDeal}>
              <h3 style={{ margin: '0 0 16px', color: '#1D3557' }}>
                {dealTitle ? `🏷️ ${dealTitle}` : 'New Deal'}
              </h3>
              <label style={s.label}>Product / Item Name *</label>
              <input style={s.input} value={dealTitle} onChange={(e) => setDealTitle(e.target.value)} placeholder="e.g. Monster Energy, 2-Liter Pepsi" />
              <label style={s.label}>Deal Text * (shown prominently in-app)</label>
              <input style={s.input} value={dealText} onChange={(e) => setDealText(e.target.value)} placeholder='e.g. 2 for $5, 3 for $4, Buy 2 Get 1 Free' maxLength={40} />
              <label style={s.label}>Description (optional)</label>
              <input style={s.input} value={dealDescription} onChange={(e) => setDealDescription(e.target.value)} placeholder="Any extra details about the deal..." />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={s.label}>Start Date *</label>
                  <input style={s.input} type="date" value={dealStartDate} onChange={(e) => setDealStartDate(e.target.value)} />
                </div>
                <div>
                  <label style={s.label}>End Date *</label>
                  <input style={s.input} type="date" value={dealEndDate} onChange={(e) => setDealEndDate(e.target.value)} />
                </div>
              </div>
              {isStoreManager ? (
                <div style={{ padding: '8px 12px', background: '#f0f4ff', borderRadius: 8, fontSize: 13, color: '#1D3557', fontWeight: 600 }}>
                  📍 This deal will apply to your store only
                </div>
              ) : (
                <>
                  <label style={s.label}>Apply To</label>
                  <select style={s.input} value={dealType} onChange={(e) => { setDealType(e.target.value as any); setDealStoreId(''); }}>
                    <option value="ALL_STORES">🌐 All 14 Stores</option>
                    <option value="SPECIFIC_STORE">📍 Specific Store Only</option>
                  </select>
                  {dealType === 'SPECIFIC_STORE' && (
                    <>
                      <label style={s.label}>Select Store *</label>
                      <select style={s.input} value={dealStoreId} onChange={(e) => setDealStoreId(e.target.value)}>
                        <option value="">-- Choose a store --</option>
                        {stores.map((store: any) => (
                          <option key={store.id} value={store.id}>{store.name} — {store.city}, {store.state}</option>
                        ))}
                      </select>
                    </>
                  )}
                </>
              )}
              <label style={s.label}>Product Category (optional)</label>
              <select style={s.input} value={dealCategory} onChange={(e) => setDealCategory(e.target.value)}>
                {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              <div style={{ display: 'flex', gap: 10 }}>
                <button style={s.saveBtn} type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Creating...' : 'Post Deal'}
                </button>
                <button style={s.cancelFormBtn} type="button" onClick={resetDealForm}>Cancel</button>
              </div>
            </form>
          )}

          {isLoading ? (
            <div style={s.empty}>Loading...</div>
          ) : dealOffers.length === 0 ? (
            <div style={s.empty}>No active deals. Click "+ New Deal" to post one.</div>
          ) : (
            <>
              <h2 style={s.sectionHead}>Active Deals ({dealOffers.length})</h2>
              <div style={s.grid}>
                {dealOffers.map((offer: any) => (
                  <DealCard key={offer.id} offer={offer} onDelete={() => deleteMutation.mutate(offer.id)} />
                ))}
              </div>
            </>
          )}

          <div style={{ marginTop: 40 }}>
            <button style={s.historyToggle} onClick={() => setShowHistory(!showHistory)}>
              {showHistory ? '▾' : '▸'} Past Deals (click to load)
            </button>
            {showHistory && (
              pastDeals.length === 0 ? (
                <div style={s.empty}>No past deals found.</div>
              ) : (
                <div style={s.grid}>
                  {pastDeals.map((offer: any) => (
                    <DealCard key={offer.id} offer={offer} isPast />
                  ))}
                </div>
              )
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Offer Card ───────────────────────────────────────────────────────────────

function OfferCard({ offer, onDelete, onReuse, isPast }: {
  offer: any; onDelete?: () => void; onReuse: () => void; isPast?: boolean;
}) {
  return (
    <div style={{ ...s.card, ...(isPast ? s.cardPast : {}) }}>
      {offer.imageUrl && <img src={offer.imageUrl} alt={offer.title} style={s.img} />}
      <div style={s.cardBody}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          <span style={offer.type === 'ALL_STORES' ? s.tagAll : s.tagStore}>
            {offer.type === 'ALL_STORES' ? '🌐 All Stores' : '📍 Store'}
          </span>
          {offer.category && <span style={s.tagCat}>{offer.category.replace(/_/g, ' ')}</span>}
          {isPast && <span style={s.tagPast}>Expired</span>}
        </div>
        <h3 style={s.cardTitle}>{offer.title}</h3>
        {offer.description && <p style={s.cardDesc}>{offer.description}</p>}
        {offer.bonusRate && (
          <span style={s.badge}>🔥 +{Math.round(offer.bonusRate * 100)}% bonus</span>
        )}
        <p style={s.cardDate}>{fmtDate(offer.startDate)} → {fmtDate(offer.endDate)}</p>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button style={s.reuseBtn} onClick={onReuse}>♻️ Reuse</button>
          {!isPast && onDelete && <button style={s.deleteBtn} onClick={onDelete}>Delete</button>}
        </div>
      </div>
    </div>
  );
}

// ─── Deal Card ────────────────────────────────────────────────────────────────

function DealCard({ offer, onDelete, isPast }: { offer: any; onDelete?: () => void; isPast?: boolean }) {
  return (
    <div style={{ ...s.card, ...(isPast ? s.cardPast : {}), borderLeft: '4px solid #E63946' }}>
      {offer.imageUrl && <img src={offer.imageUrl} alt={offer.title} style={s.img} />}
      <div style={s.cardBody}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          <span style={offer.type === 'ALL_STORES' ? s.tagAll : s.tagStore}>
            {offer.type === 'ALL_STORES' ? '🌐 All Stores' : '📍 Store'}
          </span>
          {offer.category && <span style={s.tagCat}>{offer.category.replace(/_/g, ' ')}</span>}
          {isPast && <span style={s.tagPast}>Expired</span>}
        </div>
        <div style={s.dealTextBig}>{offer.dealText}</div>
        <h3 style={s.cardTitle}>{offer.title}</h3>
        {offer.description && offer.description !== offer.dealText && (
          <p style={s.cardDesc}>{offer.description}</p>
        )}
        <p style={s.cardDate}>{fmtDate(offer.startDate)} → {fmtDate(offer.endDate)}</p>
        {!isPast && onDelete && (
          <div style={{ marginTop: 12 }}>
            <button style={s.deleteBtn} onClick={onDelete}>Delete</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  container: { padding: 32, maxWidth: 1200, margin: '0 auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  title: { fontSize: 28, fontWeight: 800, color: '#1D3557', margin: 0 },
  sub: { color: '#6c757d', marginTop: 4 },
  addBtn: { background: '#E63946', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' },
  templateBtn: { background: '#1D3557', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' },
  suggestionsBox: { background: '#f8faff', border: '1px solid #d0d9f0', borderRadius: 14, padding: 24, marginBottom: 28 },
  suggestTitle: { margin: '0 0 4px', color: '#1D3557', fontSize: 17, fontWeight: 800 },
  suggestSub: { margin: '0 0 16px', color: '#6c757d', fontSize: 13 },
  groupTabs: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 },
  groupTab: { padding: '6px 14px', borderRadius: 20, border: '1px solid #dee2e6', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#6c757d' },
  groupTabActive: { background: '#1D3557', color: '#fff', borderColor: '#1D3557' },
  templateGrid: { display: 'flex', flexDirection: 'column', gap: 10 },
  templateCard: { background: '#fff', borderRadius: 10, padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 12, border: '1px solid #e9ecef' },
  templateIcon: { fontSize: 24, flexShrink: 0, width: 32, textAlign: 'center' },
  templateTitle: { fontWeight: 700, fontSize: 14, color: '#1D3557', marginBottom: 4 },
  templateDesc: { fontSize: 13, color: '#6c757d', lineHeight: 1.5 },
  templateMeta: { display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  templateBadge: { background: '#E6394620', color: '#E63946', borderRadius: 4, padding: '2px 7px', fontSize: 11, fontWeight: 700 },
  templateCat: { background: '#2DC65320', color: '#1a7a36', borderRadius: 4, padding: '2px 7px', fontSize: 11, fontWeight: 600 },
  useBtn: { background: '#1D3557', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap', flexShrink: 0, alignSelf: 'center' },
  form: { background: '#fff', borderRadius: 12, padding: 24, marginBottom: 32, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 580 },
  label: { fontWeight: 600, fontSize: 13, color: '#212529' },
  input: { padding: '10px 14px', borderRadius: 8, border: '1px solid #dee2e6', fontSize: 15, width: '100%', boxSizing: 'border-box' as const },
  saveBtn: { background: '#2DC653', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 24px', fontWeight: 700, cursor: 'pointer' },
  cancelFormBtn: { background: '#f8f9fa', color: '#6c757d', border: '1px solid #dee2e6', borderRadius: 8, padding: '12px 24px', fontWeight: 600, cursor: 'pointer' },
  sectionHead: { fontSize: 16, fontWeight: 700, color: '#1D3557', marginBottom: 14 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 },
  card: { background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
  cardPast: { opacity: 0.8, boxShadow: 'none', border: '1px solid #e9ecef' },
  img: { width: '100%', height: 160, objectFit: 'cover' as const },
  cardBody: { padding: 16 },
  cardTitle: { fontSize: 16, fontWeight: 700, color: '#1D3557', margin: '0 0 6px' },
  cardDesc: { color: '#6c757d', fontSize: 14, margin: '0 0 8px' },
  cardDate: { color: '#adb5bd', fontSize: 12, margin: '8px 0 0' },
  badge: { display: 'inline-block', background: '#E63946', color: '#fff', borderRadius: 6, padding: '3px 10px', fontSize: 12, fontWeight: 600 },
  tagAll: { background: '#1D355715', color: '#1D3557', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700 },
  tagStore: { background: '#F4A26120', color: '#c07a20', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700 },
  tagCat: { background: '#2DC65320', color: '#1a7a36', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700 },
  tagPast: { background: '#6c757d20', color: '#6c757d', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700 },
  reuseBtn: { background: '#1D355715', color: '#1D3557', border: 'none', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 700 },
  deleteBtn: { background: 'none', border: '1px solid #dee2e6', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', color: '#6c757d', fontSize: 13 },
  historyToggle: { background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, fontWeight: 700, color: '#1D3557', padding: '8px 0', marginBottom: 8 },
  empty: { color: '#6c757d', textAlign: 'center', padding: 60 },

  mainTabs: { display: 'flex', gap: 8, marginBottom: 24, borderBottom: '2px solid #e9ecef', paddingBottom: 0 },
  mainTab: { padding: '10px 20px', borderRadius: '8px 8px 0 0', border: '1px solid #e9ecef', borderBottom: 'none', background: '#f8f9fa', cursor: 'pointer', fontSize: 14, fontWeight: 700, color: '#6c757d', display: 'flex', alignItems: 'center', gap: 8, marginBottom: -2 },
  mainTabActive: { background: '#fff', color: '#1D3557', borderColor: '#e9ecef', borderBottomColor: '#fff' },
  tabCount: { background: '#e9ecef', borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 700 },
  dealTextBig: { fontSize: 26, fontWeight: 800, color: '#E63946', marginBottom: 6 },
};
