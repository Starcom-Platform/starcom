/**
 * The Bahia layer over Brazilian Portuguese (D-ML, ML4): only the words that differ in Bahia, everything
 * else inherited. Machine-drafted; awaiting someone from Bahia to choose its words, so it stays light
 * rather than inventing regional speech.
 */
import type { Messages } from '../en';
import type { Overlay } from '../types';

const bahia: Overlay<Messages> = {
  language: {
    draft: 'Rascunho feito por máquina: ainda não revisado por alguém da Bahia. Algumas palavras podem estar erradas.',
    reviewed: 'Revisado por alguém da Bahia.',
  },
};
export default bahia;
