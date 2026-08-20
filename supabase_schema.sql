-- OpenQuiz Supabase schema
-- Run the whole file once in: Supabase Dashboard -> SQL Editor -> New query

-- User profiles
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Word progress tracking
CREATE TABLE IF NOT EXISTS word_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  word TEXT NOT NULL,
  strength FLOAT DEFAULT 0,
  last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  next_due TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  seen_count INTEGER DEFAULT 0,
  wrong_streak INTEGER DEFAULT 0,
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'learning', 'mastered')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, word)
);

-- Quiz sets (for multiple JSON files; the static site reads the manifest,
-- but this keeps parity with the original app)
CREATE TABLE IF NOT EXISTS quiz_sets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  file_path TEXT NOT NULL,
  is_public BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Custom quizzes (user-generated)
CREATE TABLE IF NOT EXISTS custom_quizzes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  words JSONB NOT NULL,
  is_public BOOLEAN DEFAULT false,
  author_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Daily stats
CREATE TABLE IF NOT EXISTS daily_stats (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  words_learned INTEGER DEFAULT 0,
  words_drilled INTEGER DEFAULT 0,
  words_examined INTEGER DEFAULT 0,
  mistakes_count INTEGER DEFAULT 0,
  accuracy FLOAT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, date)
);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE word_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_stats ENABLE ROW LEVEL SECURITY;

-- Policies for profiles
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
CREATE POLICY "Users can view their own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
CREATE POLICY "Users can update their own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
CREATE POLICY "Users can insert their own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Policies for word_progress
DROP POLICY IF EXISTS "Users can view their own progress" ON word_progress;
CREATE POLICY "Users can view their own progress" ON word_progress
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own progress" ON word_progress;
CREATE POLICY "Users can insert their own progress" ON word_progress
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own progress" ON word_progress;
CREATE POLICY "Users can update their own progress" ON word_progress
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own progress" ON word_progress;
CREATE POLICY "Users can delete their own progress" ON word_progress
  FOR DELETE USING (auth.uid() = user_id);

-- Policies for quiz_sets
DROP POLICY IF EXISTS "Everyone can view public quiz sets" ON quiz_sets;
CREATE POLICY "Everyone can view public quiz sets" ON quiz_sets
  FOR SELECT USING (is_public = true OR auth.uid() = created_by);

DROP POLICY IF EXISTS "Authenticated users can create quiz sets" ON quiz_sets;
CREATE POLICY "Authenticated users can create quiz sets" ON quiz_sets
  FOR INSERT WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "Users can update their own quiz sets" ON quiz_sets;
CREATE POLICY "Users can update their own quiz sets" ON quiz_sets
  FOR UPDATE USING (auth.uid() = created_by);

-- Policies for custom_quizzes
DROP POLICY IF EXISTS "Users can view their own quizzes" ON custom_quizzes;
CREATE POLICY "Users can view their own quizzes" ON custom_quizzes
  FOR SELECT USING (auth.uid() = user_id OR is_public = true);

DROP POLICY IF EXISTS "Users can insert their own quizzes" ON custom_quizzes;
CREATE POLICY "Users can insert their own quizzes" ON custom_quizzes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own quizzes" ON custom_quizzes;
CREATE POLICY "Users can update their own quizzes" ON custom_quizzes
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own quizzes" ON custom_quizzes;
CREATE POLICY "Users can delete their own quizzes" ON custom_quizzes
  FOR DELETE USING (auth.uid() = user_id);

-- Policies for daily_stats
DROP POLICY IF EXISTS "Users can view their own stats" ON daily_stats;
CREATE POLICY "Users can view their own stats" ON daily_stats
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own stats" ON daily_stats;
CREATE POLICY "Users can insert their own stats" ON daily_stats
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own stats" ON daily_stats;
CREATE POLICY "Users can update their own stats" ON daily_stats
  FOR UPDATE USING (auth.uid() = user_id);

-- Function + trigger to auto-create a profile on sign-up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Default quiz sets (the static site reads public/sat/quiz-sets.json,
-- this is only for parity / future server-driven lists)
INSERT INTO quiz_sets (name, description, file_path, is_public) VALUES
  ('SAT Vocabulary - Set 1', 'Core SAT vocabulary words with examples', '/sat/1.json', true),
  ('SAT Vocabulary - Set 2', 'Advanced SAT vocabulary', '/sat/2.json', true)
ON CONFLICT DO NOTHING;
