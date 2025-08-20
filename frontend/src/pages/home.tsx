import Header from "../components/Header.tsx"
import { HeroSection } from "../components/HeroSection.tsx"
import { FeatureSection } from "../components/FeatureSection.tsx"
import { BrunchSection } from "../components/BrunchSection.tsx"
import { TrailSection } from "../components/TrailSection.tsx"
import { EducationSection } from "../components/EducationSection.tsx"
import { BookingSection } from "../components/BookingSection.tsx"
import { Footer } from "../components/Footer.tsx"
export function Home() {
  return (
    <>
      <Header />
      <main className="mt-24 px-4">
        <HeroSection/>
        <FeatureSection/>
        < BrunchSection/>
        < TrailSection/>
        < EducationSection/>
        < BookingSection/>
        < Footer/>
      </main>
    </>
  )
}
