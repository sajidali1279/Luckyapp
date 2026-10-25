// What a customer is told about their hot food order, in their own language (2026-10-24). These pushes were English only, even for
// people who use the app in Spanish; the English wording is exactly what it was. A reason a store types when it declines an order is
// passed on as written.
type Msg = { title: string; body: string };
type Place = { name: string; address?: string | null; city?: string | null };

const at = (s: Place, withCity: boolean) => `${s.name}${s.address ? `, ${s.address}${withCity && s.city ? `, ${s.city}` : ''}` : ''}`;
const ended = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);
const span = (minutes: number, es: boolean) => (minutes % 60 === 0
  ? (es ? `${minutes / 60} hora${minutes === 60 ? '' : 's'}` : `${minutes / 60} hour${minutes === 60 ? '' : 's'}`)
  : (es ? `${minutes} minutos` : `${minutes} minutes`));
const pay = (es: boolean, withPoints: boolean, total: number) => (withPoints
  ? (es ? 'Pagado con puntos: no hay nada que pagar.' : 'Paid with points: nothing to pay.')
  : (es ? `Paga $${total.toFixed(2)} en el mostrador.` : `Pay $${total.toFixed(2)} at the counter.`));
const back = (es: boolean, pts: number) => (es ? `Tus ${pts} puntos ya regresaron a tu cuenta.` : `Your ${pts} points are back.`);

export const hotFoodWords = {
  accepted: (es: boolean, n: string, store: string, mins?: number): Msg => es
    ? { title: `Pedido #${n} aceptado`, body: `${store} lo está preparando${mins ? (mins === 1 ? ', listo en 1 minuto' : `, listo en unos ${mins} minutos`) : ''}.` }
    : { title: `Order #${n} accepted`, body: `${store} is making it${mins ? `, ready in about ${mins} minute${mins === 1 ? '' : 's'}` : ''}.` },

  declined: (es: boolean, n: string, store: string, reason: string | null | undefined, returnedPts: number): Msg => es
    ? { title: `No se pudo preparar el pedido #${n}`, body: `${store} no pudo preparar tu pedido${reason ? `: ${ended(reason)}` : '.'} ${returnedPts ? back(true, returnedPts) : 'No se te cobró nada.'}` }
    : { title: `Order #${n} was declined`, body: `${store} could not make your order${reason ? `: ${ended(reason)}` : '.'} ${returnedPts ? back(false, returnedPts) : 'You were not charged.'}` },

  ready: (es: boolean, n: string, store: Place, withPoints: boolean, total: number): Msg => es
    ? { title: '✅ ¡Tu comida está lista!', body: `El pedido #${n} está listo. Pasa al mostrador en ${at(store, true)}. ${pay(true, withPoints, total)}` }
    : { title: '✅ Your food is ready!', body: `Order #${n} is ready. Head to the counter at ${at(store, true)}. ${pay(false, withPoints, total)}` },

  waiting: (es: boolean, n: string, store: Place, withPoints: boolean, total: number): Msg => es
    ? { title: `🔥 El pedido #${n} te está esperando`, body: `Está listo en ${at(store, false)}. ${pay(true, withPoints, total)}` }
    : { title: `🔥 Order #${n} is waiting for you`, body: `It is ready at ${at(store, false)}. ${pay(false, withPoints, total)}` },

  closed: (es: boolean, n: string, store: string, minutes: number, withPoints: boolean, backPts: number): Msg => es
    ? { title: `El pedido #${n} se cerró`, body: `Esperó en ${store} durante ${span(minutes, true)} y nadie lo recogió, así que se cerró.${withPoints ? (backPts ? ` ${back(true, backPts)}` : ' Los puntos con que se pagó se usaron.') : ''} Puedes volver a pedir.` }
    : { title: `Order #${n} was closed`, body: `It waited at ${store} for ${span(minutes, false)} and was not picked up, so it was closed.${withPoints ? (backPts ? ` ${back(false, backPts)}` : ' The points paid for it were used.') : ''} You can order again.` },

  timedOut: (es: boolean, n: string, store: string, minutes: number, returnedPts: number): Msg => es
    ? { title: `El pedido #${n} se canceló`, body: `${store} no lo aceptó en ${minutes} minutos, así que se canceló. ${returnedPts ? back(true, returnedPts) : 'No se te cobró nada.'} Puedes volver a pedir.` }
    : { title: `Order #${n} was cancelled`, body: `${store} did not accept it within ${minutes} minutes, so it was cancelled. ${returnedPts ? back(false, returnedPts) : 'You were not charged.'} You can order again.` },
};
