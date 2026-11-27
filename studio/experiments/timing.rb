# Experimental sample-window mapping only. No I/O, dependencies, or audio synthesis.
module MvsTiming
  def self.frame_window(ppq, tempos, from, to, sample_rate)
    unless ppq.is_a?(Integer) && ppq.between?(1, 32_767) &&
           from.is_a?(Integer) && to.is_a?(Integer) && from >= 0 && to > from &&
           to <= 1_000_000_000 && sample_rate.is_a?(Integer) && sample_rate.between?(8_000, 192_000) &&
           tempos.is_a?(Array) && tempos.length <= 10_000
      raise ArgumentError, "잘못된 PPQ, 구간 또는 샘플레이트"
    end

    last = 0
    rate = 500_000
    area = 0
    segments = [[last, area, rate]]
    tempos.each do |pair|
      unless pair.is_a?(Array) && pair.length == 2 &&
             pair[0].is_a?(Integer) && pair[0].between?(last, 1_000_000_000) &&
             pair[1].is_a?(Integer) && pair[1].between?(1, 0xff_ff_ff)
        raise ArgumentError, "정렬된 정수 MIDI 템포가 필요함"
      end
      tick, next_rate = pair
      area += (tick - last) * rate
      last = tick
      rate = next_rate
      segments << [last, area, rate]
    end

    [from, to].map do |tick|
      right = segments.bsearch_index { |segment| segment[0] > tick }
      tick0, area0, tempo = segments[right ? right - 1 : -1]
      Rational((area0 + (tick - tick0) * tempo) * sample_rate, (ppq * 1_000_000)).round
    end
  end
end
