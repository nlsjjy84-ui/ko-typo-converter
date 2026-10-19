package io.github.nlsjjy84ui.kotypo.core;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/** 플러그인 안에 들어 있는 목록 파일(resources/kotypo/*.txt)을 읽는다. */
final class Resources {

    private Resources() {
    }

    static List<String> lines(String name) {
        List<String> out = new ArrayList<>();
        try (InputStream in = Resources.class.getResourceAsStream("/kotypo/" + name)) {
            if (in == null) throw new IllegalStateException("resource not found: " + name);
            BufferedReader r = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));
            String line;
            while ((line = r.readLine()) != null) {
                if (!line.isEmpty()) out.add(line);
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return out;
    }
}
