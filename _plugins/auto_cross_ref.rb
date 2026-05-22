# _plugins/auto_cross_ref.rb
require 'cgi'
require 'set'

module AutoCrossRef
  TARGET_DIR = 'docs/zemli_bylyh_legend'

  EXCLUDED_WORDS = Set.new(%w[
    народ народа народы народом народе народов народами народам
    стоянка условия наркотиков наказывает ясного усопшими
    наклоном нарубленой нарубленным усложняет усилиями наростов усы
    устойчиво уснувшего наркотических на та атака атаку атаки атакой над там сих
    края
  ].map(&:downcase)).freeze

  module RussianEndings
    ALL = %w[ами  ями  ыми  ими
      ому  ему  ого  его  ою  ею  ыми  ими  ых  их  ые  ие  ам
      ям  ах  ях  ов  ев  ей  ом  ем  ой  ей  ым  им  ая  яя
      ое  ее  ую  юю  ый  ий  ой
      ам  ям  ах  ях  ов  ев  ей  ом  ем  ой  ей  ым  им ец цы
      ая  яя  ое  ее  ую  юю  ый  ий  ой  ые  ие  ых  их  ью  ами  ями
      а  я  о  е  и  ы  у  ю].freeze
    MAX_LEN = ALL.map(&:length).max
  end

  module RussianMorph
    def self.stem_for(word)
      return word if word.length <= 3

      # # Для слов с дефисом обрабатываем КАЖДУЮ часть отдельно
      # if word.include?('-')
      #   parts = word.split('-')
      #   stemmed_parts = parts.map { |p| trim_endings(p) }
      #   return stemmed_parts.join('-')
      # end

      trim_endings(word)
    end

    # Обрезает окончания из списка (только если основа остаётся >= 3 символов)
    def self.trim_endings(word)
      RussianEndings::ALL.each do |ending|
        if word.downcase.end_with?(ending)
          candidate = word[0..-ending.length-1]
          # 🔹 ВАЖНО: проверяем, что основа достаточно длинная
          return candidate if candidate && candidate.length >= 3
        end
      end
      word
    end

    # Генерирует паттерн: оригинал + опциональные символы (для поиска в тексте)
    def self.word_pattern(word)
      stem = stem_for(word)
      # Разрешаем 0-(MAX_LEN) букв после основы (покрывает все окончания)
      suffix = "[а-яёА-ЯЁ]{0,#{RussianEndings::MAX_LEN}}"
      "#{Regexp.escape(stem)}#{suffix}"
    end

    def self.term_pattern(term)
      term.split.map { |w| word_pattern(w) }.join('\s+')
    end

    # Для сравнения: нормализуем оба слова к стему (в нижнем регистре)
    def self.canonical_stem(term)
      term.split.map { |w| stem_for(w.downcase) }.join(' ')
    end
  end

  # 🔹 ШАГ 1: Сбор заголовков
  Jekyll::Hooks.register :site, :post_read do |site|
    site.data['_cross_refs'] = {}
    (site.pages + site.documents).each do |page|
      next unless page.path.start_with?("#{TARGET_DIR}/") && page.path.end_with?('.md')
      next unless page.respond_to?(:content) && page.content

      page.content.scan(%r{^(\#{1,2})\s+(.+)$}).each do |_level, title|
        title = title.strip
        next if title.empty?
        slug = title.downcase.gsub(/[^\p{Alnum}\s-]/, '').gsub(/\s+/, '-')
        slug = CGI.escape(slug) if slug.match?(/[^a-zA-Z0-9_-]/)

        site.data['_cross_refs'][title.downcase] = {
          url: page.url,
          slug: slug,
          original: title,
          file: page.path,
          stem: RussianMorph.canonical_stem(title) # 👈 Для сравнения
        }
      end
    end
  end

  # 🔹 ШАГ 2: Внедрение ссылок
  Jekyll::Hooks.register :pages, :pre_render do |page, payload|
    next unless page.path.start_with?("#{TARGET_DIR}/") && page.path.end_with?('.md')
    refs = payload['site'].data['_cross_refs']
    next if refs.nil? || refs.empty?

    content = page.content || ""
    placeholders = {}
    idx = 0

    # Изолируем заголовки
    content = content.gsub(%r{^(\#{1,2}\s[^\n]+)}) do |m|
      k = "%%HDR_#{idx += 1}%%"
      placeholders[k] = m
      k
    end

    # Изолируем код и ссылки
    content = content.gsub(/(```[\s\S]*?```|`[^`]+`|\[.*?\]\(.*?\)|!\[.*?\]\(.*?\))/) do |m|
      k = "%%BLOCK_#{idx += 1}%%"
      placeholders[k] = m
      k
    end

    sorted_refs = refs.values.sort_by { |r| -r[:original].length }
    terms_regex = sorted_refs.map { |r| RussianMorph.term_pattern(r[:original]) }.join('|')
    full_pattern = %r{(?<![а-яёa-zA-Z0-9_\[])(#{terms_regex})(?![а-яёa-zA-Z0-9_\]])}i

    content = content.gsub(full_pattern) do |match|
      # 🔹 Сравниваем по стемам (работает в обе стороны)
      match_stem = RussianMorph.canonical_stem(match)
      ref = sorted_refs.find { |r| r[:stem] == match_stem }

      next match if ref.nil? || EXCLUDED_WORDS.include?(match.downcase)

      link = (page.path == ref[:file]) ? "##{ref[:slug]}" : "#{ref[:url]}##{ref[:slug]}"
      "[#{match}](#{link})"
    end

    placeholders.each { |k, v| content = content.gsub(k, v) }
    page.content = content
  end
end