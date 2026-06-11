import { notFound } from "../lib/errors.js";

function toLocalizedText(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return {
      en: value.en || "",
      ru: value.ru || "",
      uz: value.uz || ""
    };
  }

  return {
    en: value || "",
    ru: value || "",
    uz: value || ""
  };
}

function sortOrder(faq) {
  return faq.sortOrder ?? faq.sort_order ?? 0;
}

function serializeFaq(faq) {
  return {
    id: faq.id,
    question: toLocalizedText(faq.question),
    answer: toLocalizedText(faq.answer),
    sortOrder: sortOrder(faq),
    sort_order: sortOrder(faq),
    active: faq.active !== false,
    createdAt: faq.createdAt || faq.created_at || null,
    updatedAt: faq.updatedAt || faq.updated_at || null
  };
}

export function createFaqService({ faqs }) {
  function getFaq(faqId) {
    const faq = faqs.findById(faqId);

    if (!faq) {
      throw notFound("FAQ not found", "FAQ_NOT_FOUND");
    }

    return faq;
  }

  return {
    list({ includeInactive = false } = {}) {
      const list = includeInactive ? faqs.list() : faqs.listActive();

      return {
        faqs: list.map(serializeFaq)
      };
    },

    create({ question, answer, sortOrder = 0, active = true }) {
      return {
        faq: serializeFaq(faqs.create({
          question,
          answer,
          sortOrder,
          active
        }))
      };
    },

    update(faqId, attributes) {
      getFaq(faqId);

      return {
        faq: serializeFaq(faqs.update(faqId, attributes))
      };
    },

    delete(faqId) {
      const faq = getFaq(faqId);
      const deleted = faqs.delete(faq.id);

      return {
        deleted: true,
        faq: serializeFaq(deleted)
      };
    }
  };
}
